import asyncio
import json
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

async def decompose_task(request, task_id):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    try:
        current_user = await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))

    # Retrieve target task
    is_gt = task_id.startswith("gt_")
    task_title = ""
    task_due = ""
    if is_gt:
        try:
            gt_oid = ObjectId(task_id[3:])
            gt = await group_tasks_col.find_one({"_id": gt_oid})
        except Exception:
            gt = None
        if not gt:
            return _error("Task not found", 404)
        task_title = gt.get("title", "Advisor Task")
        task_due = gt.get("due") or "2026-11-15"
    else:
        try:
            task_oid = ObjectId(task_id)
            task = await tasks_col.find_one({"_id": task_oid, "owner_id": current_user.id})
        except Exception:
            task = None
        if not task:
            return _error("Task not found", 404)
        task_title = task.get("title", "")
        task_due = task.get("due") or "2026-11-15"

    from app.services import ollama_client
    from apps.agents.assistant import _active_model
    model = await _active_model()

    prompt = f"""You are an autonomous AI Task Decomposition Agent.
Decompose this academic/placement task into exactly 3 sequential, actionable subtasks.
Return ONLY valid JSON array of objects with keys: "title", "estimated_hours", "priority".
Task: "{task_title}"
Deadline: {task_due}"""

    subtasks_data = []
    try:
        raw = await asyncio.wait_for(
            ollama_client.chat(model, [{"role": "user", "content": prompt}], temperature=0.2),
            timeout=5.0
        )
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(cleaned)
        if isinstance(parsed, list) and len(parsed) > 0:
            subtasks_data = parsed
    except Exception:
        pass

    if not subtasks_data:
        tl = task_title.lower()
        if "wipro" in tl:
            subtasks_data = [
                {"title": "Review Wipro NLTH eligibility & register on NextGen portal", "estimated_hours": 1, "priority": "high"},
                {"title": "Practice quantitative aptitude & verbal reasoning sets", "estimated_hours": 3, "priority": "high"},
                {"title": "Revise OOPs, Java/Python, and basic SQL queries", "estimated_hours": 4, "priority": "normal"},
            ]
        elif "microsoft" in tl or "sde" in tl:
            subtasks_data = [
                {"title": "Draft 1-page ATS resume highlighting projects & GitHub", "estimated_hours": 2, "priority": "high"},
                {"title": "Solve 5 LeetCode DSA problems (Graphs, Binary Trees, DP)", "estimated_hours": 5, "priority": "high"},
                {"title": "Review System Design basics & behavioral leadership stories", "estimated_hours": 3, "priority": "normal"},
            ]
        elif "google" in tl or "gcc" in tl:
            subtasks_data = [
                {"title": "Set up GCC test environment & verify compiler setup", "estimated_hours": 1, "priority": "high"},
                {"title": "Complete Google GCC 90-minute online coding assessment", "estimated_hours": 2, "priority": "urgent"},
                {"title": "Prepare situational Googleyness & problem-solving notes", "estimated_hours": 3, "priority": "normal"},
            ]
        else:
            subtasks_data = [
                {"title": f"Phase 1: Research & requirements gathering for '{task_title}'", "estimated_hours": 2, "priority": "high"},
                {"title": f"Phase 2: Core implementation & milestone delivery for '{task_title}'", "estimated_hours": 4, "priority": "high"},
                {"title": f"Phase 3: Verification, documentation, and final submission", "estimated_hours": 1, "priority": "normal"},
            ]

    created_subtasks = []
    for item in subtasks_data[:3]:
        doc = {
            "owner_id": current_user.id,
            "title": str(item.get("title", f"Subtask for {task_title}")),
            "due": task_due,
            "agent": f"AI Decomposer ({model})",
            "status": "pending",
            "parent_task_title": task_title,
        }
        res = await tasks_col.insert_one(doc)
        doc["_id"] = res.inserted_id
        created_subtasks.append(_task_out(doc))

    return JsonResponse(created_subtasks, status=201, safe=False)


urlpatterns = [
    path("tasks", list_tasks),
    path("tasks/<str:task_id>", task_detail),
    path("tasks/<str:task_id>/decompose", decompose_task),
]

