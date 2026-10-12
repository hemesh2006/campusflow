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
    depts = sorted(await users_col.distinct("dept", {"dept": {"$nin": [None, "All"]}}))
    if not depts:
        return JsonResponse([], safe=False)

    dept_students = {d: [] for d in depts}
    dept_advisors = {d: 0 for d in depts}
    dept_staff_ids = {d: [] for d in depts}

    async for u in users_col.find({"dept": {"$in": depts}}, {"_id": 1, "role": 1, "dept": 1}):
        d = u.get("dept")
        uid = str(u["_id"])
        if d in dept_students:
            role = u.get("role")
            if role == Role.STUDENT.value:
                dept_students[d].append(uid)
                dept_staff_ids[d].append(uid)
            elif role == "advisor":
                dept_advisors[d] += 1
                dept_staff_ids[d].append(uid)
            elif role == "hod":
                dept_staff_ids[d].append(uid)

    all_owner_ids = [uid for staff_ids in dept_staff_ids.values() for uid in staff_ids]
    running_agents = set()
    if all_owner_ids:
        async for a in agents_col.find({"owner_id": {"$in": all_owner_ids}, "status": "running"}, {"owner_id": 1}):
            running_agents.add(a.get("owner_id"))

    all_student_ids = [sid for sids in dept_students.values() for sid in sids]
    task_stats = {}
    if all_student_ids:
        pipeline = [
            {"$match": {"owner_id": {"$in": all_student_ids}}},
            {"$group": {
                "_id": "$owner_id",
                "total": {"$sum": 1},
                "done": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}}
            }}
        ]
        async for t in tasks_col.aggregate(pipeline):
            task_stats[t["_id"]] = (t.get("total", 0), t.get("done", 0))

    result = []
    for dept in depts:
        s_ids = dept_students[dept]
        st_staff = dept_staff_ids[dept]
        agents_run_count = sum(1 for oid in st_staff if oid in running_agents)
        total_tasks = sum(task_stats.get(sid, (0, 0))[0] for sid in s_ids)
        done_tasks = sum(task_stats.get(sid, (0, 0))[1] for sid in s_ids)
        avg_comp = round(done_tasks / total_tasks * 100, 1) if total_tasks else 0.0
        result.append({
            "dept": dept,
            "students": len(s_ids),
            "advisors": dept_advisors[dept],
            "agents_running": agents_run_count,
            "avg_completion": avg_comp
        })
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
    students = [item async for item in users_col.find(query)]
    if not students:
        return JsonResponse([], safe=False)
    student_ids = [str(s["_id"]) for s in students]
    pipeline = [
        {"$match": {"owner_id": {"$in": student_ids}}},
        {"$group": {
            "_id": "$owner_id",
            "total": {"$sum": 1},
            "done": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}}
        }}
    ]
    task_map = {}
    async for row in tasks_col.aggregate(pipeline):
        total = row.get("total", 0)
        done = row.get("done", 0)
        task_map[row["_id"]] = round(done / total * 100, 1) if total else 0.0
    result = []
    for student in students:
        sid = str(student["_id"])
        result.append({
            "name": student["name"],
            "dept": student.get("dept"),
            "rate": task_map.get(sid, 0.0)
        })
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
    staff_members = [s async for s in users_col.find(query)]
    if not staff_members:
        return JsonResponse([], safe=False)
    staff_ids = [str(s["_id"]) for s in staff_members]

    msg_pipeline = [
        {"$match": {"from_user_id": {"$in": staff_ids}}},
        {"$group": {"_id": "$from_user_id", "count": {"$sum": 1}}}
    ]
    msg_counts = {}
    async for m in messages_col.aggregate(msg_pipeline):
        msg_counts[m["_id"]] = m["count"]

    adv_student_map = {}
    all_adv_students = set()
    async for item in users_col.find({"role": "student", "class_advisor_id": {"$in": staff_ids}}, {"_id": 1, "class_advisor_id": 1}):
        cid = str(item.get("class_advisor_id"))
        sid = str(item["_id"])
        adv_student_map.setdefault(cid, []).append(sid)
        all_adv_students.add(sid)

    done_tasks_map = {}
    if all_adv_students:
        task_pipeline = [
            {"$match": {"owner_id": {"$in": list(all_adv_students)}, "status": "done"}},
            {"$group": {"_id": "$owner_id", "count": {"$sum": 1}}}
        ]
        async for t in tasks_col.aggregate(task_pipeline):
            done_tasks_map[t["_id"]] = t["count"]

    result = []
    for staff in staff_members:
        staff_id = str(staff["_id"])
        st_ids = adv_student_map.get(staff_id, [])
        completed = sum(done_tasks_map.get(sid, 0) for sid in st_ids)
        messages = msg_counts.get(staff_id, 0)
        result.append({
            "name": staff["name"],
            "role": f"{'HOD' if staff['role'] == 'hod' else 'Advisor'} · {staff.get('dept', '')}",
            "dept": staff.get("dept"),
            "messages_sent": messages,
            "tasks_reviewed": completed,
            "activity": round(min(100, messages * 3 + completed * 2), 1)
        })
    return JsonResponse(result, safe=False)


urlpatterns = [
    path("overview/departments", departments),
    path("overview/institution", institution),
    path("overview/staff-activity", staff_activity),
    path("overview/completion-by-student", completion_by_student),
]
