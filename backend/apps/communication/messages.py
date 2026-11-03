import asyncio
import json
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from django.http import JsonResponse
from django.urls import path
from pydantic import BaseModel, ValidationError

from app.database import messages_col, users_col
from app.core.deps import get_current_user
from app.models.user import Role

DM_PREFIX = "dm-"


class MessageCreate(BaseModel):
    group: str
    text: str
    link: Optional[str] = None
    attachment: Optional[dict] = None
    workflow: Optional[dict] = None


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


def _out(message):
    return {
        "id": str(message["_id"]), "group": message["group"], "text": message.get("text", ""),
        "link": message.get("link"), "attachment": message.get("attachment"),
        "workflow": message.get("workflow"),
        "from_user_id": message["from_user_id"], "from_name": message["from_name"],
        "created_at": message["created_at"].isoformat(), "read_by": message.get("read_by", []),
        "read_count": message.get("read_count", 0),
        "deleted_for_everyone": message.get("deleted_for_everyone", False),
    }


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


def _allowed(group, user):
    if not group:
        return False
    if group.startswith(DM_PREFIX):
        return user.id in group[len(DM_PREFIX):].split("-")
    if group.startswith("class-") or group.startswith("advisor-class-"):
        advisor_id = group.replace("advisor-class-", "").replace("class-", "")
        return (user.role == Role.ADVISOR and user.id == advisor_id) or \
               (user.role == Role.STUDENT and user.class_advisor_id == advisor_id) or \
               (user.role in (Role.ADMIN, Role.PRINCIPAL, Role.HOD))
    if group.startswith("hod-advisor-"):
        return user.role in (Role.ADMIN, Role.HOD, Role.ADVISOR)
    if group == "principal-hod":
        return user.role in (Role.ADMIN, Role.PRINCIPAL, Role.HOD)
    if group.startswith("placement-"):
        return True
    if group in ("CSE-C", "AIDS-A", "general", "common") or group.startswith("dept-"):
        return True
    return False



async def messages_collection(request):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    body = _body(request) if request.method == "POST" else None
    group = request.GET.get("group") or (body or {}).get("group")
    if not group or not _allowed(group, current_user):
        return _error("Access denied", 403)
    if request.method == "GET":
        messages = [_out(message) async for message in messages_col.find({"group": group, "deleted_for": {"$ne": current_user.id}}).sort("created_at", -1)]
        return JsonResponse(messages, safe=False)
    if request.method != "POST":
        return _error("Method not allowed", 405)
    try:
        payload = MessageCreate.model_validate(body)
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    if payload.group != group or not _allowed(payload.group, current_user):
        return _error("Access denied", 403)
    document = {**payload.model_dump(), "from_user_id": current_user.id, "from_name": current_user.name, "created_at": datetime.now(timezone.utc), "read_by": [], "read_count": 0, "deleted_for": [], "deleted_for_everyone": False}
    result = await messages_col.insert_one(document)
    document["_id"] = result.inserted_id
    # ── Auto-analyse advisor class-group messages for tasks/drives ──
    if current_user.role in (Role.ADVISOR, Role.HOD) and (
        payload.group.startswith("class-") or payload.group.startswith("advisor-class-")
    ):
        try:
            from apps.tasks.group_tasks import analyse_and_act
            asyncio.create_task(analyse_and_act(document, current_user))
        except Exception:
            pass

    # ── Auto-reply from CampusFlow AI Agent for DM queries ──
    if payload.group in (f"{DM_PREFIX}{current_user.id}-agent", f"{DM_PREFIX}agent-{current_user.id}"):
        async def _trigger_agent_reply(user_obj, text_prompt, thread_group):
            try:
                from app.services import user_knowledge, ollama_client
                from app.services.hierarchy_sync import get_user_hierarchy_node
                from app.services.query_intelligence import (
                    analyze_query_intent,
                    synthesize_direct_reply,
                    build_lean_llm_prompt,
                )
                from apps.agents.assistant import _active_model

                snapshot = await user_knowledge.get_or_build_snapshot(user_obj.id)
                h_node = get_user_hierarchy_node(user_obj.id)
                intent = analyze_query_intent(text_prompt)

                if intent != "general":
                    reply = synthesize_direct_reply(intent, text_prompt, user_obj, snapshot, h_node)
                else:
                    model = await _active_model()
                    lean_prompt = build_lean_llm_prompt(user_obj, snapshot, h_node)
                    llm_messages = [{"role": "system", "content": lean_prompt}]
                    
                    # Fetch last 4 turns in this thread for conversation context
                    thread_history = []
                    async for m in messages_col.find({"group": thread_group}).sort("created_at", -1).limit(4):
                        r = "assistant" if m.get("from_user_id") == "agent" else "user"
                        thread_history.append({"role": r, "content": (m.get("text") or "")[:300]})
                    thread_history.reverse()
                    llm_messages.extend(thread_history)

                    try:
                        reply = await ollama_client.chat(model, llm_messages, timeout=3.5)
                    except Exception:
                        reply = None

                    if not reply:
                        reply = synthesize_direct_reply("general", text_prompt, user_obj, snapshot, h_node)

                agent_message_doc = {
                    "group": thread_group,
                    "text": reply,
                    "link": None,
                    "attachment": None,
                    "workflow": None,
                    "from_user_id": "agent",
                    "from_name": "CampusFlow AI Agent",
                    "created_at": datetime.now(timezone.utc),
                    "read_by": [],
                    "read_count": 0,
                    "deleted_for": [],
                    "deleted_for_everyone": False,
                }
                await messages_col.insert_one(agent_message_doc)
            except Exception:
                pass

        asyncio.create_task(_trigger_agent_reply(current_user, payload.text, payload.group))

    return JsonResponse(_out(document), status=201)


async def mark_read(request, msg_id):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    try:
        object_id = ObjectId(msg_id)
    except Exception:
        return _error("Invalid message ID", 400)
    message = await messages_col.find_one({"_id": object_id})
    if not message:
        return _error("Message not found", 404)
    if current_user.id not in message.get("read_by", []):
        await messages_col.update_one({"_id": object_id}, {"$addToSet": {"read_by": current_user.id}, "$inc": {"read_count": 1}})
        message.setdefault("read_by", []).append(current_user.id)
        message["read_count"] = message.get("read_count", 0) + 1
    return JsonResponse(_out(message))


async def delete_message(request, msg_id):
    if request.method != "DELETE":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    try:
        object_id = ObjectId(msg_id)
    except Exception:
        return _error("Invalid message ID", 400)
    message = await messages_col.find_one({"_id": object_id})
    if not message or not _allowed(message.get("group", ""), current_user):
        return _error("Message not found", 404)
    scope = request.GET.get("scope", "me")
    if scope == "everyone":
        if message["from_user_id"] != current_user.id and current_user.role != Role.ADMIN:
            return _error("Only the sender or an admin can delete this for everyone", 403)
        await messages_col.update_one({"_id": object_id}, {"$set": {"text": "", "attachment": None, "link": None, "deleted_for_everyone": True}})
    else:
        await messages_col.update_one({"_id": object_id}, {"$addToSet": {"deleted_for": current_user.id}})
    return JsonResponse({"ok": True, "scope": scope})


async def dm_threads(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    latest = {}
    query = {"group": {"$regex": f"^{DM_PREFIX}({current_user.id}-|.*-{current_user.id}$)"}}
    async for message in messages_col.find(query).sort("created_at", 1):
        participants = message["group"][len(DM_PREFIX):].split("-")
        if len(participants) == 2 and current_user.id in participants:
            latest[message["group"]] = message
    other_ids = set()
    for group in latest:
        for p in group[len(DM_PREFIX):].split("-"):
            if p != current_user.id:
                try:
                    other_ids.add(ObjectId(p))
                except Exception:
                    pass
    users = {str(user["_id"]): user async for user in users_col.find({"_id": {"$in": list(other_ids)}})}
    result = []
    for group, message in latest.items():
        other_id = next((participant for participant in group[len(DM_PREFIX):].split("-") if participant != current_user.id), None)
        if not other_id:
            continue
        other = users.get(other_id, {})
        result.append({
            "group": group,
            "other_user_id": other_id,
            "other_user_name": other.get("name", "Unknown"),
            "other_user_role": other.get("role"),
            "last_text": message.get("text", ""),
            "last_at": message["created_at"].isoformat(),
            "last_from_me": message.get("from_user_id") == current_user.id,
            "has_attachment": bool(message.get("attachment")),
        })

    # Always provide the user's permanent AI Agent conversation thread
    agent_group = f"{DM_PREFIX}{current_user.id}-agent"
    agent_msg = await messages_col.find_one({"group": agent_group}, sort=[("created_at", -1)])
    agent_thread = {
        "group": agent_group,
        "other_user_id": "agent",
        "other_user_name": "CampusFlow AI Agent",
        "other_user_role": "agent",
        "last_text": agent_msg.get("text") if agent_msg else "Hello! I am your CampusFlow AI Agent with real-time institutional and placement tracking. Ask me anything!",
        "last_at": agent_msg["created_at"].isoformat() if agent_msg else datetime.now(timezone.utc).isoformat(),
        "last_from_me": agent_msg.get("from_user_id") == current_user.id if agent_msg else False,
        "has_attachment": bool(agent_msg.get("attachment")) if agent_msg else False,
        "is_agent": True,
    }
    result.insert(0, agent_thread)
    return JsonResponse(result, safe=False)


urlpatterns = [
    path("messages", messages_collection),
    path("messages/dm/threads", dm_threads),
    path("messages/read/<str:msg_id>", mark_read),
    path("messages/<str:msg_id>", delete_message),
]
