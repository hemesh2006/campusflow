from bson import ObjectId
from django.http import JsonResponse
from django.urls import path

from app.database import tasks_col
from app.core.deps import get_current_user
from app.api.requests import request_data
from app.api.serializers import TaskCreateSerializer, TaskUpdateSerializer


def _error(detail, status_code):
    return JsonResponse({"detail": detail}, status=status_code)


def _task_out(task):
    return {
        "id": str(task["_id"]),
        "owner_id": task["owner_id"],
        "title": task["title"],
        "due": task["due"],
        "agent": task.get("agent"),
        "status": task["status"],
    }


async def list_tasks(request):
    if request.method == "POST":
        return await create_task(request)
    if request.method != "GET":
        return _error("Method not allowed", 405)
    try:
        current_user = await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))
    tasks = [_task_out(task) async for task in tasks_col.find({"owner_id": current_user.id})]
    return JsonResponse(tasks, safe=False)


async def create_task(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    try:
        current_user = await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))
    payload = TaskCreateSerializer(data=request_data(request) or {})
    if not payload.is_valid():
        return _error(payload.errors, 400)

    document = {**payload.validated_data, "owner_id": current_user.id}
    result = await tasks_col.insert_one(document)
    document["_id"] = result.inserted_id
    return JsonResponse(_task_out(document), status=201)


async def update_task(request, task_id):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    try:
        current_user = await get_current_user(request)
        object_id = ObjectId(task_id)
    except Exception as exc:
        if isinstance(exc, ValueError):
            return _error("Invalid task ID", 400)
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))
    payload = TaskUpdateSerializer(data=request_data(request) or {})
    if not payload.is_valid():
        return _error(payload.errors, 400)

    task = await tasks_col.find_one({"_id": object_id, "owner_id": current_user.id})
    if not task:
        return _error("Task not found", 404)

    updates = {key: value for key, value in payload.validated_data.items() if value is not None}
    if updates:
        await tasks_col.update_one({"_id": object_id}, {"$set": updates})
        task.update(updates)
    return JsonResponse(_task_out(task))


urlpatterns = [
    path("tasks", list_tasks),
    path("tasks/<str:task_id>", update_task),
]
