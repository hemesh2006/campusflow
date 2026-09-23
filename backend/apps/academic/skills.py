import json
from typing import Optional

from bson import ObjectId
from django.http import JsonResponse
from django.urls import path
from pydantic import BaseModel, ValidationError

from app.database import skills_col
from app.core.deps import get_current_user


class SkillTopic(BaseModel):
    name: str
    score: float


class SkillCreate(BaseModel):
    skill: str
    level: float
    topics: list[SkillTopic] = []
    trend: list[float] = []


class SkillUpdate(BaseModel):
    level: Optional[float] = None
    topics: Optional[list[SkillTopic]] = None
    trend: Optional[list[float]] = None


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _error(detail, status_code):
    return JsonResponse({"detail": detail}, status=status_code)


def _out(skill):
    return {
        "id": str(skill["_id"]),
        "owner_id": skill["owner_id"],
        "skill": skill["skill"],
        "level": skill["level"],
        "topics": skill.get("topics", []),
        "trend": skill.get("trend", []),
    }


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


async def skills_collection(request):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if request.method == "GET":
        return JsonResponse([_out(item) async for item in skills_col.find({"owner_id": current_user.id})], safe=False)
    if request.method != "POST":
        return _error("Method not allowed", 405)
    try:
        payload = SkillCreate.model_validate(_body(request))
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    document = {**payload.model_dump(), "owner_id": current_user.id}
    result = await skills_col.insert_one(document)
    document["_id"] = result.inserted_id
    return JsonResponse(_out(document), status=201)


async def update_skill(request, skill_id):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    try:
        payload = SkillUpdate.model_validate(_body(request))
        object_id = ObjectId(skill_id)
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    except Exception:
        return _error("Invalid skill ID", 400)
    skill = await skills_col.find_one({"_id": object_id, "owner_id": current_user.id})
    if not skill:
        return _error("Skill not found", 404)
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    if updates:
        await skills_col.update_one({"_id": object_id}, {"$set": updates})
        skill.update(updates)
    return JsonResponse(_out(skill))


async def delete_skill(request, skill_id):
    if request.method != "DELETE":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    try:
        object_id = ObjectId(skill_id)
    except Exception:
        return _error("Invalid skill ID", 400)
    result = await skills_col.delete_one({"_id": object_id, "owner_id": current_user.id})
    if result.deleted_count == 0:
        return _error("Skill not found", 404)
    return JsonResponse({}, status=204)


async def skill_detail(request, skill_id):
    if request.method == "PATCH":
        return await update_skill(request, skill_id)
    if request.method == "DELETE":
        return await delete_skill(request, skill_id)
    return _error("Method not allowed", 405)


urlpatterns = [
    path("skills/me", skills_collection),
    path("skills", skills_collection),
    path("skills/<str:skill_id>", skill_detail),
]
