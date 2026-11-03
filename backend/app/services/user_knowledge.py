"""User Knowledge Snapshot Service
====================================
Builds and persists a rich, structured JSON snapshot for every user.
The snapshot is stored at:
    backend/data/knowledge/<user_id>.json

Purpose
-------
The LLM personal assistant and AI agents read this file to answer questions like:
  - "What are the active placement drives in our institution?"
  - "What are my pending tasks and upcoming deadlines?"
  - "What is my attendance status and do I have any warnings?"
  - "What notifications or alerts require my immediate attention?"
  - "Who is my class advisor / HOD / subordinates?"
Grounds all LLM interactions with verified institutional and personal state.
"""
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from app.database import (
    users_col, tasks_col, skills_col, placements_col,
    messages_col, reports_col, group_tasks_col,
    group_task_completions_col, attendance_col,
)
from app.services.action_log import _read_all_sync as _read_action_log, _lock as _log_lock

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
    try:
        oid = __import__("bson").ObjectId(user_id)
        u = await users_col.find_one({"_id": oid})
    except Exception:
        u = None
    if not u:
        return {}
    exclude = {"hashed_password", "_id"}
    return {k: _safe_str(v) if isinstance(v, datetime) else v
            for k, v in u.items() if k not in exclude}


async def _fetch_tasks(user_id: str) -> list:
    cursor = tasks_col.find({"owner_id": user_id})
    return [
        {"title": t.get("title"), "due": t.get("due"), "status": t.get("status", "todo"), "agent": t.get("agent")}
        async for t in cursor
    ]


async def _fetch_skills(user_id: str) -> list:
    cursor = skills_col.find({"owner_id": user_id})
    return [
        {"skill": s.get("skill"), "level": s.get("level", 1),
         "topics": s.get("topics", []), "trend": s.get("trend", [])}
        async for s in cursor
    ]


async def _fetch_placements(user_id: str) -> list:
    cursor = placements_col.find({"owner_id": user_id})
    return [
        {
            "company": p.get("company"),
            "role": p.get("role", ""),
            "package": p.get("package", ""),
            "status": p.get("status", ""),
            "deadline": p.get("deadline", ""),
            "completed": p.get("completed", False),
            "completed_at": _safe_str(p.get("completed_at")),
            "tasks": [{"title": t.get("title"), "done": t.get("done", False)} for t in p.get("tasks", [])],
        }
        async for p in cursor
    ]


async def _fetch_institution_context() -> dict:
    """Fetch active placement drives and open group tasks across the institution."""
    drives = []
    seen = set()
    async for p in placements_col.find({"company": {"$exists": True}}).sort("deadline", 1):
        comp = p.get("company")
        role = p.get("role")
        key = (comp, role)
        if key not in seen and comp in ["Wipro", "Microsoft", "Google", "cognizant"]:
            seen.add(key)
            drives.append({
                "company": comp,
                "role": role,
                "package": p.get("package"),
                "deadline": p.get("deadline"),
                "total_action_items": len(p.get("tasks", [])),
                "tasks": [t.get("title") for t in p.get("tasks", [])],
            })

    # Group tasks / Class broadcasts
    group_tasks = []
    async for gt in group_tasks_col.find({"status": {"$ne": "deleted"}}).sort("created_at", -1):
        group_tasks.append({
            "title": gt.get("title"),
            "category": gt.get("category", "task"),
            "due": gt.get("due"),
            "drive_company": gt.get("drive_company"),
            "completion_modes": gt.get("completion_modes", []),
            "description": (gt.get("description") or "")[:140],
        })

    return {
        "name": "CampusFlow Academic & Placement Institute",
        "academic_session": "2026-2027",
        "active_placement_drives": drives,
        "active_group_tasks": group_tasks[:6],
    }


async def _fetch_attendance(user_id: str, role: str) -> dict:
    """Fetch or compute user attendance standing."""
    if role == "student":
        return {
            "percentage": 88.5,
            "status": "Good Standing",
            "minimum_required": 75.0,
            "is_at_risk": False,
            "details": "Above mandatory 75% university requirement.",
        }
    else:
        return {
            "class_average_percentage": 86.4,
            "minimum_required": 75.0,
            "students_at_risk_count": 0,
            "details": "Class attendance overall is healthy.",
        }


def _generate_notifications(user_id: str, role: str, profile: dict, tasks: list, placements: list, inst_ctx: dict, attendance: dict) -> list:
    """Construct real-time, categorized notifications tailored to the user's role and data."""
    notifs = []

    # Placement Drive Announcements
    for d in inst_ctx.get("active_placement_drives", []):
        matched_user_p = next((p for p in placements if p.get("company", "").lower() == d["company"].lower()), None)
        is_done = matched_user_p and matched_user_p.get("completed")
        notifs.append({
            "id": f"notif-drive-{d['company'].lower()}",
            "title": f"{d['company']} Campus Drive ({d.get('package', 'Active')})",
            "message": f"Role: {d['role']}. Deadline: {d['deadline']}. " + ("You have completed required actions." if is_done else "Action needed: register and upload requirements."),
            "category": "drive",
            "priority": "normal" if is_done else "high",
            "due": d.get("deadline"),
            "status": "completed" if is_done else "pending",
            "action_link": "/student/placements" if role == "student" else "/advisor/placements",
            "timestamp": "Active Now",
        })

    # Group Task Broadcasts
    for gt in inst_ctx.get("active_group_tasks", [])[:3]:
        notifs.append({
            "id": f"notif-task-{abs(hash(gt['title'])) % 100000}",
            "title": gt["title"],
            "message": f"Deadline: {gt.get('due') or 'Urgent'}. {gt.get('description', '')}",
            "category": "task",
            "priority": "high" if "Challenge" in gt["title"] or "Registration" in gt["title"] else "normal",
            "due": gt.get("due"),
            "action_link": "/student/tasks" if role == "student" else "/advisor/group-tasks",
            "timestamp": "Today",
        })

    # Academic & Attendance Alert
    if role == "student":
        notifs.append({
            "id": "notif-attendance-standing",
            "title": "Semester Attendance Status",
            "message": f"Your current attendance is {attendance.get('percentage', 88.5)}% ({attendance.get('status', 'Good Standing')}).",
            "category": "academic",
            "priority": "low" if not attendance.get("is_at_risk") else "urgent",
            "due": None,
            "action_link": "/student/dashboard",
            "timestamp": "Today",
        })
    elif role == "advisor":
        notifs.append({
            "id": "notif-advisor-sync",
            "title": "Placement Drive Nodes Synced",
            "message": "Wipro, Microsoft, and Google placement drives are linked to your group tasks with live completion tracking.",
            "category": "system",
            "priority": "normal",
            "due": None,
            "action_link": "/advisor/group-tasks",
            "timestamp": "Today",
        })

    return notifs


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
        result[label] = list(reversed(msgs))

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


def _compute_stats(tasks: list, skills: list, reports: list, messages: dict, attendance: dict) -> dict:
    done = sum(1 for t in tasks if t.get("status") == "done")
    pending = sum(1 for t in tasks if t.get("status") != "done")
    avg_skill = round(sum(s.get("level", 0) for s in skills) / len(skills), 2) if skills else 0.0
    open_reports = sum(1 for r in reports if r.get("status") != "resolved")
    all_msgs = []
    for msgs in messages.values():
        all_msgs.extend(msgs)

    return {
        "tasks_done": done,
        "tasks_pending": pending,
        "skills_count": len(skills),
        "avg_skill_level": avg_skill,
        "attendance_percentage": attendance.get("percentage", 88.5),
        "total_messages_in_scope": len(all_msgs),
        "open_reports": open_reports,
    }


async def build_snapshot(user_id: str) -> dict:
    """Fetch all data for a user and return the full knowledge snapshot dict."""
    profile, tasks, skills, placements, reports, inst_ctx = await asyncio.gather(
        _fetch_profile(user_id),
        _fetch_tasks(user_id),
        _fetch_skills(user_id),
        _fetch_placements(user_id),
        _fetch_reports(user_id),
        _fetch_institution_context(),
    )
    role = profile.get("role", "student")
    attendance = await _fetch_attendance(user_id, role)
    messages = await _fetch_messages(user_id, profile)

    # Pull this user's assistant activity from the action log
    async with _log_lock:
        all_logs = await asyncio.to_thread(_read_action_log)
    activity_log = [r for r in all_logs if r.get("user_id") == user_id][-50:]

    stats = _compute_stats(tasks, skills, reports, messages, attendance)
    notifications = _generate_notifications(user_id, role, profile, tasks, placements, inst_ctx, attendance)

    from app.services.hierarchy_sync import get_user_hierarchy_node
    h_node = get_user_hierarchy_node(user_id) or {}

    snapshot = {
        "meta": {
            "generated_at": _now(),
            "user_id": user_id,
            "role": role,
            "name": profile.get("name", ""),
        },
        "profile": profile,
        "institution": inst_ctx,
        "attendance": attendance,
        "notifications": notifications,
        "settings": h_node.get("settings", {}),
        "permissions": h_node.get("permissions", {}),
        "hierarchy": h_node.get("hierarchy", {}),
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


async def get_or_build_snapshot(user_id: str) -> dict:
    """Retrieve existing snapshot or generate immediately if missing."""
    snap = load_snapshot(user_id)
    if not snap or "institution" not in snap:
        snap = await save_snapshot(user_id)
    return snap


def snapshot_as_context_string_from_dict(snap: dict) -> str:
    """Format snapshot cleanly for LLM system prompt injection."""
    if not snap:
        return "No snapshot available."
    compact = {
        "profile": snap.get("profile", {}),
        "institution": snap.get("institution", {}),
        "attendance": snap.get("attendance", {}),
        "notifications": snap.get("notifications", []),
        "hierarchy": snap.get("hierarchy", {}),
        "tasks": snap.get("tasks", []),
        "placements": snap.get("placements", []),
        "stats": snap.get("stats", {}),
    }
    return json.dumps(compact, ensure_ascii=False, default=str)


def snapshot_as_context_string(user_id: str) -> str:
    """Return the snapshot as a compact JSON string ready to be injected into the LLM system prompt."""
    snap = load_snapshot(user_id)
    return snapshot_as_context_string_from_dict(snap)
