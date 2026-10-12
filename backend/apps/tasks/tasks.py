from datetime import datetime, timezone
from bson import ObjectId
from django.http import JsonResponse
from django.urls import path

from app.database import tasks_col, group_tasks_col, group_task_completions_col
from app.core.deps import get_current_user
from app.api.requests import request_data
from app.api.serializers import TaskCreateSerializer, TaskUpdateSerializer
from app.models.user import Role


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

    # If student, also include all class advisor broadcast tasks
    if current_user.role == Role.STUDENT:
        async for gt in group_tasks_col.find({"status": {"$ne": "deleted"}}).sort("created_at", -1):
            gt_id = str(gt["_id"])
            c_doc = await group_task_completions_col.find_one({"task_id": gt_id, "student_id": current_user.id})
            status = "done" if c_doc else "pending"
            tasks.append({
                "id": f"gt_{gt_id}",
                "owner_id": current_user.id,
                "title": gt.get("title", "Advisor Task"),
                "due": gt.get("due") or "Open",
                "agent": f"Advisor · {gt.get('advisor_name', 'Class Advisor')}",
                "status": status,
                "is_group_task": True,
            })

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
    from app.services.hierarchy_sync import trigger_hierarchy_sync
    trigger_hierarchy_sync()
    return JsonResponse(_task_out(document), status=201)


async def task_detail(request, task_id):
    try:
        current_user = await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))

    # Handle Group Tasks dispatched to student
    if task_id.startswith("gt_"):
        gt_id = task_id[3:]
        try:
            gt_oid = ObjectId(gt_id)
        except Exception:
            return _error("Invalid task ID", 400)
        gt = await group_tasks_col.find_one({"_id": gt_oid})
        if not gt:
            return _error("Task not found", 404)

        if request.method == "PATCH":
            data = request_data(request) or {}
            new_status = data.get("status")
            now = datetime.now(timezone.utc)
            if new_status == "done":
                await group_task_completions_col.update_one(
                    {"task_id": gt_id, "student_id": current_user.id},
                    {"$set": {
                        "task_id": gt_id,
                        "student_id": current_user.id,
                        "student_name": current_user.name,
                        "mode": "mark_done",
                        "completed_at": now,
                    }},
                    upsert=True,
                )
            else:
                await group_task_completions_col.delete_one({"task_id": gt_id, "student_id": current_user.id})

            from app.services.hierarchy_sync import trigger_hierarchy_sync
            trigger_hierarchy_sync()

            return JsonResponse({
                "id": task_id,
                "owner_id": current_user.id,
                "title": gt.get("title", "Advisor Task"),
                "due": gt.get("due") or "Open",
                "agent": f"Advisor · {gt.get('advisor_name', 'Class Advisor')}",
                "status": new_status,
            })
        return _error("Method not allowed", 405)

    # Handle standard agent tasks
    try:
        object_id = ObjectId(task_id)
    except Exception:
        return _error("Invalid task ID", 400)

    if request.method == "DELETE":
        res = await tasks_col.delete_one({"_id": object_id, "owner_id": current_user.id})
        if res.deleted_count == 0:
            return _error("Task not found", 404)
        from app.services.hierarchy_sync import trigger_hierarchy_sync
        trigger_hierarchy_sync()
        return JsonResponse({}, status=204)

    if request.method == "PATCH":
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
            from app.services.hierarchy_sync import trigger_hierarchy_sync
            trigger_hierarchy_sync()
        return JsonResponse(_task_out(task))

    return _error("Method not allowed", 405)


urlpatterns = [
    path("tasks", list_tasks),
    path("tasks/<str:task_id>", task_detail),
]

