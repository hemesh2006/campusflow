"""User Knowledge Snapshot Service
====================================
Builds and persists a rich, structured JSON snapshot for every user.
The snapshot is stored at:
    backend/data/knowledge/<user_id>.json

Purpose
-------
The LLM personal assistant reads this file to answer questions like
  "What are my pending tasks?", "Who is my class advisor?",
  "How many messages did I send today?", "What is my CGPA?"
without having to query every collection every time.

Snapshot shape (all fields optional / role-dependent):
{
  "meta": { "generated_at": "...", "user_id": "...", "role": "..." },
  "profile": { ...UserPublic fields... },
  "tasks": [ { title, due, status, agent } ],
  "skills": [ { skill, level, topics, trend } ],
  "placements": [ { company, role, status, applied_at } ],
  "recent_messages": {
      "class_group":     [ last 20 msgs in class group ],
      "hod_advisor":     [ last 20 msgs in hod-advisor group ],
      "principal_hod":   [ last 20 msgs in principal-hod group ],
      "direct_messages": [ last 20 DMs across all threads ]
  },
  "reports": [ { title, status, created_at } ],
  "activity_log": [ last 50 assistant interactions ],
  "stats": {
      "tasks_done": int, "tasks_pending": int,
      "skills_count": int, "avg_skill_level": float,
      "unread_messages": int, "open_reports": int
  }
}
"""
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from app.database import (
    users_col, tasks_col, skills_col, placements_col,
    messages_col, reports_col,
)
from app.services.action_log import _read_all as _read_action_log, _lock as _log_lock

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "knowledge"
_write_lock = asyncio.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_str(v) -> str:
    """Convert any bson/datetime value to a JSON-safe string."""
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v) if v is not None else None


async def _fetch_profile(user_id: str) -> dict:
    u = await users_col.find_one({"_id": __import__("bson").ObjectId(user_id)})
    if not u:
        return {}
    exclude = {"hashed_password", "_id"}
    return {k: _safe_str(v) if isinstance(v, datetime) else v
            for k, v in u.items() if k not in exclude}


async def _fetch_tasks(user_id: str) -> list:
    cursor = tasks_col.find({"owner_id": user_id})
    return [
        {"title": t["title"], "due": t["due"], "status": t["status"], "agent": t.get("agent")}
        async for t in cursor
    ]


async def _fetch_skills(user_id: str) -> list:
    cursor = skills_col.find({"owner_id": user_id})
    return [
        {"skill": s["skill"], "level": s["level"],
         "topics": s.get("topics", []), "trend": s.get("trend", [])}
        async for s in cursor
    ]


async def _fetch_placements(user_id: str) -> list:
    cursor = placements_col.find({"owner_id": user_id})
    return [
        {
            "company": p["company"],
            "role": p.get("role", ""),
            "status": p.get("status", ""),
            "applied_at": _safe_str(p.get("applied_at")),
        }
        async for p in cursor
    ]


async def _fetch_reports(user_id: str) -> list:
    cursor = reports_col.find({"$or": [{"from_user_id": user_id}, {"assigned_to": user_id}]})
    return [
        {
            "title": r.get("title", ""),
            "status": r.get("status", ""),
            "from_dept": r.get("from_dept", ""),
            "created_at": _safe_str(r.get("created_at")),
        }
        async for r in cursor
    ]


async def _fetch_messages(user_id: str, profile: dict) -> dict:
    """Collect the last 20 messages from every group this user belongs to."""
    role = profile.get("role", "")
    dept = (profile.get("dept") or "").lower().replace(" ", "")
    advisor_id = profile.get("class_advisor_id") or user_id

    groups: dict[str, str] = {}

    if role in ("student", "advisor"):
        groups["class_group"] = f"class-{advisor_id}"
    if role in ("advisor", "hod"):
        groups["hod_advisor"] = f"hod-advisor-{dept}" if dept else ""
    if role in ("hod", "principal", "admin"):
        groups["principal_hod"] = "principal-hod"

    result: dict[str, list] = {}
    for label, gid in groups.items():
        if not gid:
            continue
        cursor = messages_col.find({"group": gid}).sort("created_at", -1).limit(20)
        msgs = []
        async for m in cursor:
            msgs.append({
                "from": m.get("from_name", ""),
                "text": m.get("text", ""),
                "time": _safe_str(m.get("created_at")),
                "read_count": m.get("read_count", 0),
            })
        result[label] = list(reversed(msgs))  # chronological order

    # DMs — last 20 across all threads involving this user
    dm_cursor = messages_col.find(
        {"group": {"$regex": "^dm-"}},
    ).sort("created_at", -1).limit(100)
    dms = []
    async for m in dm_cursor:
        grp = m.get("group", "")
        parts = grp[3:].split("-")
        if user_id in parts:
            dms.append({
                "from": m.get("from_name", ""),
                "text": m.get("text", ""),
                "time": _safe_str(m.get("created_at")),
                "thread": grp,
            })
        if len(dms) >= 20:
            break
    result["direct_messages"] = list(reversed(dms))

    return result


def _compute_stats(tasks: list, skills: list, reports: list, messages: dict) -> dict:
    done = sum(1 for t in tasks if t["status"] == "done")
    pending = sum(1 for t in tasks if t["status"] != "done")
    avg_skill = round(sum(s["level"] for s in skills) / len(skills), 2) if skills else 0.0
    open_reports = sum(1 for r in reports if r["status"] != "resolved")
    all_msgs = []
    for msgs in messages.values():
        all_msgs.extend(msgs)

    return {
        "tasks_done": done,
        "tasks_pending": pending,
        "skills_count": len(skills),
        "avg_skill_level": avg_skill,
        "total_messages_in_scope": len(all_msgs),
        "open_reports": open_reports,
    }


async def build_snapshot(user_id: str) -> dict:
    """Fetch all data for a user and return the full knowledge snapshot dict."""
    profile, tasks, skills, placements, reports = await asyncio.gather(
        _fetch_profile(user_id),
        _fetch_tasks(user_id),
        _fetch_skills(user_id),
        _fetch_placements(user_id),
        _fetch_reports(user_id),
    )
    messages = await _fetch_messages(user_id, profile)

    # Pull this user's assistant activity from the action log
    async with _log_lock:
        all_logs = _read_action_log()
    activity_log = [r for r in all_logs if r.get("user_id") == user_id][-50:]

    stats = _compute_stats(tasks, skills, reports, messages)

    snapshot = {
        "meta": {
            "generated_at": _now(),
            "user_id": user_id,
            "role": profile.get("role", "unknown"),
            "name": profile.get("name", ""),
        },
        "profile": profile,
        "tasks": tasks,
        "skills": skills,
        "placements": placements,
        "recent_messages": messages,
        "reports": reports,
        "activity_log": activity_log,
        "stats": stats,
    }
    return snapshot


async def save_snapshot(user_id: str) -> dict:
    """Build and persist the snapshot to disk. Returns the snapshot dict."""
    snapshot = await build_snapshot(user_id)
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    path = KNOWLEDGE_DIR / f"{user_id}.json"
    async with _write_lock:
        path.write_text(
            json.dumps(snapshot, indent=2, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
    return snapshot


def load_snapshot(user_id: str) -> dict:
    """Synchronously read the last persisted snapshot (safe for non-async callers)."""
    path = KNOWLEDGE_DIR / f"{user_id}.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def snapshot_as_context_string(user_id: str) -> str:
    """Return the snapshot as a compact JSON string ready to be injected into
    the LLM system prompt as context / knowledge. Keeps only LLM-relevant fields."""
    snap = load_snapshot(user_id)
    if not snap:
        return ""
    # Omit the raw activity_log from the LLM context (too large); keep everything else
    compact = {k: v for k, v in snap.items() if k != "activity_log"}
    return json.dumps(compact, ensure_ascii=False, default=str)
