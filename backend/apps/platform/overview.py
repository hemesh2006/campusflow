from datetime import datetime, timedelta, timezone

from django.http import JsonResponse
from django.urls import path

from app.database import users_col, tasks_col, agents_col, messages_col
from app.core.deps import get_current_user
from app.models.user import Role


def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


def _allowed(user, roles):
    return user.role in roles


async def _completion(owner_ids):
    if not owner_ids:
        return 0.0
    total = await tasks_col.count_documents({"owner_id": {"$in": owner_ids}})
    if not total:
        return 0.0
    done = await tasks_col.count_documents({"owner_id": {"$in": owner_ids}, "status": "done"})
    return round(done / total * 100, 1)


async def departments(request):
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if not _allowed(user, (Role.PRINCIPAL, Role.HOD, Role.ADMIN)):
        return _error("Not permitted for this role", 403)
    depts = await users_col.distinct("dept", {"dept": {"$nin": [None, "All"]}})
    result = []
    for dept in sorted(depts):
        students = [str(item["_id"]) async for item in users_col.find({"role": Role.STUDENT.value, "dept": dept}, {"_id": 1})]
        staff = students + [str(item["_id"]) async for item in users_col.find({"role": {"$in": ["advisor", "hod"]}, "dept": dept}, {"_id": 1})]
        result.append({"dept": dept, "students": len(students), "advisors": await users_col.count_documents({"role": "advisor", "dept": dept}), "agents_running": await agents_col.count_documents({"owner_id": {"$in": staff}, "status": "running"}), "avg_completion": await _completion(students)})
    return JsonResponse(result, safe=False)


async def institution(request):
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if not _allowed(user, (Role.PRINCIPAL, Role.ADMIN)):
        return _error("Not permitted for this role", 403)
    students = [str(item["_id"]) async for item in users_col.find({"role": Role.STUDENT.value}, {"_id": 1})]
    departments_count = len(await users_col.distinct("dept", {"dept": {"$nin": [None, "All"]}}))
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    return JsonResponse({"total_students": len(students), "total_departments": departments_count, "overall_completion_rate": await _completion(students), "messages_this_week": await messages_col.count_documents({"created_at": {"$gte": week_ago}})})


async def completion_by_student(request):
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if not _allowed(user, (Role.PRINCIPAL, Role.HOD, Role.ADMIN)):
        return _error("Not permitted for this role", 403)
    query = {"role": Role.STUDENT.value}
    if user.role == Role.HOD and user.dept:
        query["dept"] = user.dept
    result = []
    async for student in users_col.find(query):
        result.append({"name": student["name"], "dept": student.get("dept"), "rate": await _completion([str(student["_id"])])})
    return JsonResponse(result, safe=False)


async def staff_activity(request):
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if not _allowed(user, (Role.PRINCIPAL, Role.HOD, Role.ADMIN)):
        return _error("Not permitted for this role", 403)
    query = {"role": {"$in": ["advisor", "hod"]}}
    if user.role == Role.HOD and user.dept:
        query["dept"] = user.dept
    result = []
    async for staff in users_col.find(query):
        staff_id = str(staff["_id"])
        students = [str(item["_id"]) async for item in users_col.find({"role": "student", "class_advisor_id": staff_id}, {"_id": 1})]
        completed = await tasks_col.count_documents({"owner_id": {"$in": students}, "status": "done"}) if students else 0
        messages = await messages_col.count_documents({"from_user_id": staff_id})
        result.append({"name": staff["name"], "role": f"{'HOD' if staff['role'] == 'hod' else 'Advisor'} · {staff.get('dept', '')}", "dept": staff.get("dept"), "messages_sent": messages, "tasks_reviewed": completed, "activity": round(min(100, messages * 3 + completed * 2), 1)})
    return JsonResponse(result, safe=False)


urlpatterns = [
    path("overview/departments", departments),
    path("overview/institution", institution),
    path("overview/staff-activity", staff_activity),
    path("overview/completion-by-student", completion_by_student),
]
