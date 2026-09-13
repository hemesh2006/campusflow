"""Append-only, file-backed action log for the personal assistant agent.

Every query a user sends to their agent — and the step it's currently
on — is written to `backend/data/user_action.json` as one JSON record.
This is what makes an agent conversation resumable: the frontend calls
GET /assistant/history on open and rehydrates the chat panel from
whatever is in this file, instead of starting from nothing every time
the page reloads or the browser is closed and reopened.

This is deliberately a plain JSON file (not a Mongo collection) per
the requirement to "maintain every detail and action in
user_action.json" — Mongo is still used for durable app data
(users/tasks/agents/etc.), this file is specifically the assistant's
step-by-step activity trail.

Record shape:
{
  "id": "…",
  "user_id": "…",
  "user_name": "…",
  "role": "student",
  "step": "chat_query",
  "message": "…",           # what the user asked
  "response": "…" | null,   # what the agent replied (once finished)
  "model": "llama3.2" | null,
  "status": "in_progress" | "completed" | "error",
  "created_at": "2026-08-24T10:15:00+00:00",
  "updated_at": "2026-08-24T10:15:04+00:00"
}
"""
import json
import uuid
import asyncio
from datetime import datetime, timezone
from pathlib import Path

LOG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "user_action.json"
MAX_RECORDS = 2000  # institution-wide cap so the file doesn't grow forever

_lock = asyncio.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_all() -> list[dict]:
    if not LOG_PATH.exists():
        return []
    try:
        text = LOG_PATH.read_text(encoding="utf-8")
        return json.loads(text) if text.strip() else []
    except (json.JSONDecodeError, OSError):
        # A corrupt/partial file should never take the assistant down —
        # start fresh rather than 500ing every chat request.
        return []


def _write_all(records: list[dict]) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")


async def start_action(user_id: str, user_name: str, role: str, message: str, step: str = "chat_query") -> dict:
    """Log a new action as in_progress and persist it immediately —
    so even if the Ollama call never comes back, there's a durable
    record that this step was started and can be resumed/retried."""
    record = {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "user_name": user_name,
        "role": role,
        "step": step,
        "message": message,
        "response": None,
        "model": None,
        "status": "in_progress",
        "created_at": _now(),
        "updated_at": _now(),
    }
    async with _lock:
        records = _read_all()
        records.append(record)
        if len(records) > MAX_RECORDS:
            records = records[-MAX_RECORDS:]
        _write_all(records)
    return record


async def finish_action(action_id: str, response: str, model: str | None, status: str = "completed") -> None:
    async with _lock:
        records = _read_all()
        for r in records:
            if r["id"] == action_id:
                r["response"] = response
                r["model"] = model
                r["status"] = status
                r["updated_at"] = _now()
                break
        _write_all(records)


async def user_history(user_id: str, limit: int = 30) -> list[dict]:
    """Most recent `limit` actions for this user, oldest first — ready
    to be replayed straight into the chat panel."""
    async with _lock:
        records = _read_all()
    mine = [r for r in records if r["user_id"] == user_id]
    return mine[-limit:]
