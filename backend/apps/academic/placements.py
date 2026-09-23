import json
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from django.http import JsonResponse
from django.urls import path
from pydantic import BaseModel, ValidationError

from app.database import placements_col, users_col
from app.core.deps import get_current_user
from app.models.user import Role


class PlacementTask(BaseModel):
    title: str
    done: bool = False


class PlacementCreate(BaseModel):
    company: str
    role: str
    package: Optional[str] = None
    deadline: str
    status: str = "action_needed"
    tasks: list[PlacementTask] = []
    completed: bool = False
    completed_at: Optional[str] = None


class PlacementUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    package: Optional[str] = None
    deadline: Optional[str] = None
    status: Optional[str] = None


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


def _out(item):
    return {
        "id": str(item["_id"]), "owner_id": item["owner_id"],
        "company": item["company"], "role": item["role"],
        "package": item.get("package"), "deadline": item["deadline"],
        "status": item["status"], "tasks": item.get("tasks", []),
        "completed": item.get("completed", False),
        "completed_at": item.get("completed_at"),
    }


async def _user(request):
    try:
        from app.core.deps import get_current_user
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


async def placements_collection(request):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if request.method == "GET":
        items = [_out(item) async for item in placements_col.find({"owner_id": current_user.id})]
        return JsonResponse(items, safe=False)
    if request.method != "POST":
        return _error("Method not allowed", 405)
    try:
        payload = PlacementCreate.model_validate(_body(request))
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    document = {**payload.model_dump(), "owner_id": current_user.id}
    result = await placements_col.insert_one(document)
    document["_id"] = result.inserted_id
    return JsonResponse(_out(document), status=201)


async def _owned(placement_id, user_id):
    try:
        object_id = ObjectId(placement_id)
    except Exception:
        return None, _error("Invalid placement ID", 400)
    item = await placements_col.find_one({"_id": object_id, "owner_id": user_id})
    if not item:
        return None, _error("Placement not found", 404)
    return item, None


async def placement_detail(request, placement_id):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    item, error = await _owned(placement_id, current_user.id)
    if error:
        return error
    if request.method == "PATCH":
        try:
            updates = PlacementUpdate.model_validate(_body(request)).model_dump(exclude_unset=True)
        except ValidationError as exc:
            return _error(exc.errors(), 422)
        updates = {key: value for key, value in updates.items() if value is not None}
        if updates:
            await placements_col.update_one({"_id": item["_id"]}, {"$set": updates})
            item.update(updates)
        return JsonResponse(_out(item))
    if request.method == "DELETE":
        await placements_col.delete_one({"_id": item["_id"]})
        return JsonResponse({}, status=204)
    return _error("Method not allowed", 405)


async def placement_task(request, placement_id, task_index):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    item, error = await _owned(placement_id, current_user.id)
    if error:
        return error
    try:
        index = int(task_index)
        done = str(request.GET.get("done", "false")).lower() == "true"
        tasks = item.get("tasks", [])
        if index < 0 or index >= len(tasks):
            return _error("Task not found", 404)
        tasks[index]["done"] = done
    except (ValueError, TypeError):
        return _error("Invalid task index", 400)
    await placements_col.update_one({"_id": item["_id"]}, {"$set": {"tasks": tasks}})
    item["tasks"] = tasks
    return JsonResponse(_out(item))


async def complete_placement(request, placement_id):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    item, error = await _owned(placement_id, current_user.id)
    if error:
        return error
    tasks = item.get("tasks", [])
    for task in tasks:
        task["done"] = True
    updates = {"tasks": tasks, "completed": True, "completed_at": datetime.now(timezone.utc).isoformat()}
    await placements_col.update_one({"_id": item["_id"]}, {"$set": updates})
    item.update(updates)
    return JsonResponse(_out(item))


async def advisor_summary(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if current_user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted for this role", 403)
    query = {"role": Role.STUDENT.value}
    if current_user.role != Role.ADMIN and current_user.dept:
        query["dept"] = current_user.dept
    students = {str(user["_id"]): user async for user in users_col.find(query)}
    drives = {}
    async for item in placements_col.find({"owner_id": {"$in": list(students)}}):
        student = students.get(item["owner_id"])
        if not student:
            continue
        key = (item["company"], item["role"])
        drive = drives.setdefault(key, {"company": item["company"], "role": item["role"], "package": item.get("package"), "deadline": item["deadline"], "students": []})
        drive["students"].append({"student_id": item["owner_id"], "student_name": student["name"], "student_email": student["email"], "completed": item.get("completed", False), "completed_at": item.get("completed_at"), "tasks": item.get("tasks", [])})
    return JsonResponse([{**drive, "total_students": len(drive["students"]), "completed_count": sum(student["completed"] for student in drive["students"])} for drive in drives.values()], safe=False)


urlpatterns = [
    path("placements", placements_collection),
    path("placements/advisor/summary", advisor_summary),
    path("placements/<str:placement_id>", placement_detail),
    path("placements/<str:placement_id>/tasks/<str:task_index>", placement_task),
    path("placements/<str:placement_id>/complete", complete_placement),
]
