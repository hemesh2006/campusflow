"""The per-user personal assistant ("Agent") — a chatbot backed by a
local Ollama model, one persona per role. Every message is logged
step-by-step to backend/data/user_action.json (see
app/services/action_log.py) so a conversation survives a reload. The
active model is admin-configured (Mongo `settings` collection, one doc)
and shared by every user's agent — set it from Admin → Agent manager,
which calls GET /assistant/models and POST /assistant/model below.
"""
from datetime import datetime, timezone
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status

from campusflow.backend.app.config import settings as app_settings
from campusflow.backend.app.database import settings_col
from campusflow.backend.app.core.deps import get_current_user, require_role
from campusflow.backend.app.models.user import UserPublic, Role
from campusflow.backend.app.services import user_knowledge
from campusflow.backend.app.services import action_log, ollama_client

router = APIRouter(prefix="/assistant", tags=["assistant"])

SETTINGS_DOC_ID = "assistant"

ROLE_BRIEF = {
    Role.STUDENT: "a student using CampusFlow to track tasks, placement drives, skills, attendance and CGPA",
    Role.ADVISOR: "a class advisor overseeing one class of students — their task completion, attendance, and placement progress",
    Role.HOD: "a Head of Department overseeing every advisor and student in their department",
    Role.PRINCIPAL: "the Principal with an institution-wide view across all departments",
    Role.ADMIN: "a system administrator managing users, agents, and platform health",
}


def _system_prompt(user: UserPublic, knowledge_ctx: str = "") -> str:
    brief = ROLE_BRIEF.get(user.role, "a CampusFlow user")
    base = (
        f"You are the personal assistant agent for {user.name}, {brief}. "
        "You are built into the CampusFlow platform. "
        "Be concise, warm, and directly useful — a few short sentences or a tight bullet "
        "list, not an essay, unless the user clearly wants depth. "
        "Format every reply in Markdown: use **bold** for anything the user must not miss "
        "(deadlines, statuses, counts, action items), and *italics* for supporting detail. "
        "Whenever you mention any date or time, always wrap it in ** bold ** — for example "
        "**August 24, 2026** or **10:30 AM** — so it stands out immediately. "
        "If the user's message is vague, general chit-chat, or doesn't clearly state what "
        "they want, do not guess or invent details — briefly and politely ask what they'd "
        "like help with, and offer two or three concrete examples relevant to their role. "
        "You have access to the user's current state snapshot below — use it to answer "
        "questions accurately without inventing numbers."
    )
    if knowledge_ctx:
        base += (
            "\n\n--- USER KNOWLEDGE SNAPSHOT (JSON) ---\n"
            + knowledge_ctx
            + "\n--- END SNAPSHOT ---"
        )
    else:
        base += (
            " You do not have live, automatic access to their database records inside this "
            "message unless they're pasted into the conversation — say so plainly rather than "
            "inventing numbers."
        )
    return base


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []  # recent turns, oldest first — for context only


class ChatResponse(BaseModel):
    id: str
    response: str
    status: str
    model: str
    created_at: str


async def _active_model() -> str:
    doc = await settings_col.find_one({"_id": SETTINGS_DOC_ID})
    return (doc or {}).get("model") or app_settings.ollama_default_model


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, current_user: UserPublic = Depends(get_current_user)):
    text = payload.message.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Message can't be empty")

    # Step 1 — record the query as in_progress before calling the model,
    # so there's always a durable trail even if Ollama never responds.
    record = await action_log.start_action(
        current_user.id, current_user.name, current_user.role.value, text, step="chat_query"
    )

    # Step 2 — load user knowledge snapshot for LLM context (non-blocking if missing)
    knowledge_ctx = user_knowledge.snapshot_as_context_string(current_user.id)

    model = await _active_model()
    messages = [{"role": "system", "content": _system_prompt(current_user, knowledge_ctx)}]
    for h in payload.history[-8:]:
        if h.role in ("user", "assistant"):
            messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": text})

    # Step 3 — call the LLM and close out the step either way.
    try:
        reply = await ollama_client.chat(model, messages)
        if not reply:
            reply = "I didn't get a response back from the model — try asking again."
        await action_log.finish_action(record["id"], reply, model, status="completed")
        # Step 4 — refresh knowledge snapshot in the background so next turn is up-to-date.
        import asyncio
        asyncio.create_task(user_knowledge.save_snapshot(current_user.id))
        return ChatResponse(
            id=record["id"], response=reply, status="completed", model=model, created_at=record["created_at"]
        )
    except ollama_client.OllamaError as e:
        await action_log.finish_action(record["id"], str(e), model, status="error")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))


@router.get("/history")
async def history(limit: int = 30, current_user: UserPublic = Depends(get_current_user)):
    """Powers "resume where I left off" — the frontend replays this
    straight into the chat panel on open."""
    return await action_log.user_history(current_user.id, limit)


@router.get("/models")
async def models(current_user: UserPublic = Depends(require_role(Role.ADMIN))):
    """Every model currently pulled on the Ollama host, plus which one
    is active — Admin → Agent manager renders this as the model picker."""
    try:
        raw = await ollama_client.list_models()
    except ollama_client.OllamaError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
    active = await _active_model()
    return {
        "active": active,
        "models": [
            {"name": m.get("name"), "size": m.get("size"), "modified_at": m.get("modified_at")}
            for m in raw
        ],
    }


class ModelSelect(BaseModel):
    model: str


@router.post("/model")
async def set_model(payload: ModelSelect, current_user: UserPublic = Depends(require_role(Role.ADMIN))):
    """Admin picks the model every user's agent runs on."""
    await settings_col.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"model": payload.model, "updated_by": current_user.id, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"active": payload.model}
