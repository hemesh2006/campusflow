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


def _prompt(user, context, hierarchy_node=None):
    first_name = (user.name or "User").split()[0]
    return f"""You are the CampusFlow AI Assistant for {user.name} ({ROLE_BRIEF.get(user.role, 'a CampusFlow user')}).
Address the user as {first_name}.

RULES:
- Answer the user's message directly, clearly, and concisely in simple conversational terms.
- Do NOT use rigid section headers or multi-heading boilerplate templates.
- Address exactly what they asked without dumping unrelated institutional data.
- Keep responses short, practical, and easy to read (1-3 paragraphs or clean bullet points).
- Highlight key dates, deadlines, and metrics in bold (e.g. **2026-11-10**, **88.5%**, **5.6 LPA**).

Institutional Context:
{context or 'No additional context available.'}"""


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
    
    snapshot = await user_knowledge.get_or_build_snapshot(user.id)
    from app.services.hierarchy_sync import get_user_hierarchy_node
    hierarchy_node = get_user_hierarchy_node(user.id)

    from app.services.query_intelligence import (
        analyze_query_intent,
        synthesize_direct_reply,
        build_lean_llm_prompt,
    )

    intent = analyze_query_intent(text)

    # ── Fast Path for simple, specific institutional queries ─────────────
    # Instantly returns (<50ms) a concise, plain-English answer grounded in user context.
    if intent != "general":
        reply = synthesize_direct_reply(intent, text, user, snapshot, hierarchy_node)
        await action_log.finish_action(record["id"], reply, "campusflow-smart-context", status="completed")
        asyncio.create_task(user_knowledge.save_snapshot(user.id))
        return JsonResponse({
            "id": record["id"],
            "response": reply,
            "status": "completed",
            "model": "campusflow-smart-context",
            "created_at": record["created_at"],
        })

    # ── Open-ended / General queries ─────────────────────────────────────
    # Use lean micro-prompting and short timeout (3.5s) to eliminate CPU prefill latency.
    model = await _active_model()
    lean_prompt = build_lean_llm_prompt(user, snapshot, hierarchy_node)
    messages = [{"role": "system", "content": lean_prompt}]
    for item in payload.history[-4:]:
        if item.role in ("user", "assistant"):
            messages.append({"role": item.role, "content": item.content[:300]})
    messages.append({"role": "user", "content": text})

    try:
        reply = await ollama_client.chat(model, messages, timeout=3.5)
        if not reply:
            reply = synthesize_direct_reply("general", text, user, snapshot, hierarchy_node)
        await action_log.finish_action(record["id"], reply, model, status="completed")
        asyncio.create_task(user_knowledge.save_snapshot(user.id))
        return JsonResponse({
            "id": record["id"],
            "response": reply,
            "status": "completed",
            "model": model,
            "created_at": record["created_at"],
        })
    except Exception:
        # Instant grounded fallback on timeout or connection error without stalling
        reply = synthesize_direct_reply("general", text, user, snapshot, hierarchy_node)
        await action_log.finish_action(record["id"], reply, f"{model} (smart-fallback)", status="completed")
        return JsonResponse({
            "id": record["id"],
            "response": reply,
            "status": "completed",
            "model": model,
            "created_at": record["created_at"],
        })


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
        return JsonResponse({
            "active": await _active_model(),
            "models": [{"name": item.get("name"), "size": item.get("size"), "modified_at": item.get("modified_at")} for item in raw],
            "ollama_online": True,
        })
    except ollama_client.OllamaError:
        active = await _active_model()
        return JsonResponse({
            "active": active,
            "models": [
                {"name": "llama3.2", "size": "2.0 GB", "modified_at": "catalog"},
                {"name": "llama3", "size": "4.7 GB", "modified_at": "catalog"},
                {"name": "mistral", "size": "4.1 GB", "modified_at": "catalog"},
                {"name": "deepseek-r1:1.5b", "size": "1.1 GB", "modified_at": "catalog"},
            ],
            "ollama_online": False,
            "notice": "Ollama server currently offline; default model catalog active."
        })


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
    body = _body(request)
    text = (body.get("message") or body.get("text") or "").strip()
    if not text:
        return _error("Message can't be empty", 400)
    engine = (body.get("engine") or "auto").strip().lower()
    timeout = float(body.get("timeout") or 3.5)

    model = await _active_model()
    timed_out = False
    result = None

    if engine in ("auto", "ollama"):
        prompt = f"""Classify this campus advisor announcement into exactly one category and one action.
Return ONLY valid JSON with these keys: category, action_type, title, summary, due_at.
Allowed category values: placement, event, academic, attendance, document, general.
Allowed action_type values: form_entry, file_upload, excel_upload, acknowledge, none.
Use null for due_at when no date is present. Do not invent deadlines.
Message: {text}"""
        try:
            raw = await asyncio.wait_for(
                ollama_client.chat(model, [{"role": "user", "content": prompt}], temperature=0, timeout=timeout),
                timeout=timeout + 0.5
            )
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and "category" in parsed:
                result = parsed
        except Exception:
            timed_out = True
            if engine == "ollama":
                return _error(f"Ollama model ({model}) timed out or failed.", 504)

    allowed_categories = {"placement", "event", "academic", "attendance", "document", "general"}
    allowed_actions = {"form_entry", "file_upload", "excel_upload", "acknowledge", "none"}

    if not result:
        # Heuristic / Words-based local classifier fallback
        tl = text.lower()
        is_placement = any(k in tl for k in ["wipro", "tcs", "zoho", "cognizant", "infosys", "placement", "drive", "hiring", "ctc", "lpa"])
        is_attendance = any(k in tl for k in ["attendance", "present", "absent", "roll call"])
        is_doc = any(k in tl for k in ["upload", "photo", "document", "certificate", "id card"])
        is_form = any(k in tl for k in ["fill", "form", "sheet", "excel", "register", "submit"])
        
        cat = "placement" if is_placement else "attendance" if is_attendance else "document" if is_doc else "academic" if is_form else "general"
        action = "excel_upload" if "excel" in tl or "sheet" in tl else "file_upload" if is_doc else "form_entry" if is_form else "acknowledge" if is_placement else "none"

        result = {
            "category": cat,
            "action_type": action,
            "title": text[:60].rstrip(".!?,") + ("…" if len(text) > 60 else ""),
            "summary": text[:200],
            "due_at": None,
        }

    result["category"] = result.get("category") if result.get("category") in allowed_categories else "general"
    result["action_type"] = result.get("action_type") if result.get("action_type") in allowed_actions else "none"
    result["title"] = str(result.get("title") or text[:80]).strip()
    result["summary"] = str(result.get("summary") or text).strip()
    result["due_at"] = result.get("due_at") or None

    return JsonResponse({
        "classification": result,
        "model": model,
        "engine": "local_rules" if timed_out or engine in ("local", "heuristic") else "ollama",
        "timed_out": timed_out,
        "notice": (
            f"Ollama ({model}) timed out after {timeout}s. Classified with Local Keyword Engine."
            if timed_out else
            f"Classified by Ollama LLM ({model})" if not engine in ("local", "heuristic") else
            "Classified by Local Keyword Engine."
        )
    })


async def notifications_list(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    snapshot = await user_knowledge.get_or_build_snapshot(user.id)
    return JsonResponse(snapshot.get("notifications", []), safe=False)


urlpatterns = [
    path("assistant/chat", chat),
    path("assistant/history", history),
    path("assistant/models", models),
    path("assistant/model", set_model),
    path("assistant/classify-message", classify_message),
    path("assistant/notifications", notifications_list),
]
