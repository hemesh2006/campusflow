import asyncio
import json
from datetime import datetime, timezone

from django.http import JsonResponse
from django.urls import path
from pydantic import BaseModel, ValidationError

from app.config import settings as app_settings
from app.database import settings_col
from app.core.deps import get_current_user
from app.models.user import Role
from app.services import action_log, ollama_client, user_knowledge


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ModelSelect(BaseModel):
    model: str


class MessageClassifyRequest(BaseModel):
    message: str


ROLE_BRIEF = {
    Role.STUDENT: "a student using CampusFlow to track tasks, placement drives, skills, attendance and CGPA",
    Role.ADVISOR: "a class advisor overseeing one class of students",
    Role.HOD: "a Head of Department overseeing advisors and students",
    Role.PRINCIPAL: "the Principal with an institution-wide view",
    Role.ADMIN: "a system administrator managing users and platform health",
}


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


async def _active_model():
    document = await settings_col.find_one({"_id": "assistant"})
    return (document or {}).get("model") or app_settings.ollama_default_model


def _prompt(user, context):
    return f"You are the personal assistant agent for {user.name}, {ROLE_BRIEF.get(user.role, 'a CampusFlow user')}. Be concise, warm, and directly useful. Format replies in Markdown. User snapshot: {context or 'No snapshot available.'}"


async def chat(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    try:
        payload = ChatRequest.model_validate(_body(request))
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    text = payload.message.strip()
    if not text:
        return _error("Message can't be empty", 400)
    record = await action_log.start_action(user.id, user.name, user.role.value, text, step="chat_query")
    context = user_knowledge.snapshot_as_context_string(user.id)
    model = await _active_model()
    messages = [{"role": "system", "content": _prompt(user, context)}]
    messages.extend({"role": item.role, "content": item.content} for item in payload.history[-8:] if item.role in ("user", "assistant"))
    messages.append({"role": "user", "content": text})
    try:
        reply = await ollama_client.chat(model, messages) or "I didn't get a response back from the model — try asking again."
        await action_log.finish_action(record["id"], reply, model, status="completed")
        asyncio.create_task(user_knowledge.save_snapshot(user.id))
        return JsonResponse({"id": record["id"], "response": reply, "status": "completed", "model": model, "created_at": record["created_at"]})
    except ollama_client.OllamaError as exc:
        await action_log.finish_action(record["id"], str(exc), model, status="error")
        return _error(str(exc), 502)


async def history(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    try:
        limit = int(request.GET.get("limit", 30))
    except ValueError:
        limit = 30
    return JsonResponse(await action_log.user_history(user.id, limit), safe=False)


async def models(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    try:
        raw = await ollama_client.list_models()
    except ollama_client.OllamaError as exc:
        return _error(str(exc), 502)
    return JsonResponse({"active": await _active_model(), "models": [{"name": item.get("name"), "size": item.get("size"), "modified_at": item.get("modified_at")} for item in raw]})


async def set_model(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    try:
        payload = ModelSelect.model_validate(_body(request))
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    await settings_col.update_one({"_id": "assistant"}, {"$set": {"model": payload.model, "updated_by": user.id, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return JsonResponse({"active": payload.model})


async def classify_message(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Only staff can classify messages", 403)
    try:
        payload = MessageClassifyRequest.model_validate(_body(request))
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    text = payload.message.strip()
    if not text:
        return _error("Message can't be empty", 400)

    model = await _active_model()
    prompt = f"""Classify this campus advisor announcement into exactly one category and one action.
Return ONLY valid JSON with these keys: category, action_type, title, summary, due_at.
Allowed category values: placement, event, academic, attendance, document, general.
Allowed action_type values: form_entry, file_upload, excel_upload, acknowledge, none.
Use null for due_at when no date is present. Do not invent deadlines.
Message: {text}"""
    try:
        raw = await ollama_client.chat(model, [{"role": "user", "content": prompt}], temperature=0)
    except ollama_client.OllamaError as exc:
        return _error(str(exc), 502)
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(cleaned)
    except (json.JSONDecodeError, AttributeError):
        return _error("The Ollama model returned an invalid classification.", 502)
    allowed_categories = {"placement", "event", "academic", "attendance", "document", "general"}
    allowed_actions = {"form_entry", "file_upload", "excel_upload", "acknowledge", "none"}
    result["category"] = result.get("category") if result.get("category") in allowed_categories else "general"
    result["action_type"] = result.get("action_type") if result.get("action_type") in allowed_actions else "none"
    result["title"] = str(result.get("title") or text[:80]).strip()
    result["summary"] = str(result.get("summary") or text).strip()
    result["due_at"] = result.get("due_at") or None
    return JsonResponse({"classification": result, "model": model})


urlpatterns = [
    path("assistant/chat", chat),
    path("assistant/history", history),
    path("assistant/models", models),
    path("assistant/model", set_model),
    path("assistant/classify-message", classify_message),
]
