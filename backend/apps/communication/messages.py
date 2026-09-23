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
    if group.startswith(DM_PREFIX):
        return user.id in group[len(DM_PREFIX):].split("-")
    if group.startswith("class-") or group.startswith("advisor-class-"):
        advisor_id = group.replace("advisor-class-", "").replace("class-", "")
        return (user.role == Role.ADVISOR and user.id == advisor_id) or (user.role == Role.STUDENT and user.class_advisor_id == advisor_id)
    if group.startswith("hod-advisor-"):
        return user.role in (Role.ADMIN, Role.HOD, Role.ADVISOR)
    if group == "principal-hod":
        return user.role in (Role.ADMIN, Role.PRINCIPAL, Role.HOD)
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
    async for message in messages_col.find({"group": {"$regex": f"^{DM_PREFIX}"}}).sort("created_at", 1):
        participants = message["group"][len(DM_PREFIX):].split("-")
        if len(participants) == 2 and current_user.id in participants:
            latest[message["group"]] = message
    other_ids = {next(participant for participant in group[len(DM_PREFIX):].split("-") if participant != current_user.id) for group in latest}
    users = {str(user["_id"]): user async for user in users_col.find({"_id": {"$in": [ObjectId(user_id) for user_id in other_ids]}})}
    result = []
    for group, message in latest.items():
        other_id = next(participant for participant in group[len(DM_PREFIX):].split("-") if participant != current_user.id)
        other = users.get(other_id, {})
        result.append({"group": group, "other_user_id": other_id, "other_user_name": other.get("name", "Unknown"), "other_user_role": other.get("role"), "last_text": message.get("text", ""), "last_at": message["created_at"].isoformat(), "last_from_me": message.get("from_user_id") == current_user.id, "has_attachment": bool(message.get("attachment"))})
    return JsonResponse(result, safe=False)


urlpatterns = [
    path("messages", messages_collection),
    path("messages/dm/threads", dm_threads),
    path("messages/read/<str:msg_id>", mark_read),
    path("messages/<str:msg_id>", delete_message),
]
