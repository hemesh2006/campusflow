from bson import ObjectId
from django.http import JsonResponse
from django.urls import path

from app.api.requests import request_data
from app.api.serializers import (
    AcademicUpdateSerializer,
    AdminRoleSerializer,
    AssignAdvisorSerializer,
    AssignHodSerializer,
    ProfileUpdateSerializer,
    SettingsUpdateSerializer,
    StudentCreateSerializer,
    UserIdSerializer,
)
from app.core.deps import get_current_user, user_doc_to_public
from app.core.security import hash_password
from app.database import users_col, tasks_col, attendance_col, messages_col
from app.models.user import Role
from app.services.hierarchy_sync import (
    trigger_hierarchy_sync,
    sync_hierarchy_now,
    read_hierarchy_cached,
    get_default_settings,
)



def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


def _public(user):
    return JsonResponse(user_doc_to_public(user).model_dump(mode="json"))


async def me(request):
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if request.method == "GET":
        return JsonResponse(user.model_dump(mode="json"))
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    serializer = ProfileUpdateSerializer(data=request_data(request) or {})
    if not serializer.is_valid():
        return _error(serializer.errors, 400)
    updates = {key: value for key, value in serializer.validated_data.items() if value is not None}
    if updates:
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": updates})
        trigger_hierarchy_sync()
    return _public(await users_col.find_one({"_id": ObjectId(user.id)}))


async def directory(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    result = [
        {"id": str(item["_id"]), "name": item["name"], "email": item["email"], "role": item["role"], "dept": item.get("dept")}
        async for item in users_col.find({"_id": {"$ne": ObjectId(user.id)}})
    ]
    return JsonResponse(result, safe=False)


async def add_student(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.ADMIN):
        return _error("Not permitted for this role", 403)
    serializer = StudentCreateSerializer(data=request_data(request) or {})
    if not serializer.is_valid():
        return _error(serializer.errors, 400)
    data = serializer.validated_data
    if await users_col.find_one({"email": data["email"]}):
        return _error("Email already registered", 409)
    document = {
        "name": data["name"],
        "email": data["email"],
        "hashed_password": hash_password("password123"),
        "role": Role.STUDENT.value,
        "dept": data.get("dept") or user.dept,
        "class_advisor_id": user.id if user.role == Role.ADVISOR else None,
        "roll_id": data.get("roll_id"),
        "attendance": 100,
        "fairness": 0.2,
        "semesters": [],
        "placement_eligible": True,
    }
    result = await users_col.insert_one(document)
    document["_id"] = result.inserted_id
    trigger_hierarchy_sync()
    return JsonResponse(user_doc_to_public(document).model_dump(mode="json"), status=201)


async def students(request):
    if request.method == "POST":
        return await add_student(request)
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted for this role", 403)
    query = {"role": "student"}
    if user.role == Role.ADVISOR:
        query["class_advisor_id"] = user.id
    elif user.role == Role.HOD and user.dept:
        query["dept"] = user.dept
    students = [item async for item in users_col.find(query)]
    student_ids = [str(item["_id"]) for item in students]
    task_map = {}
    if student_ids:
        pipeline = [
            {"$match": {"owner_id": {"$in": student_ids}}},
            {"$group": {
                "_id": "$owner_id",
                "total": {"$sum": 1},
                "done": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}}
            }}
        ]
        async for row in tasks_col.aggregate(pipeline):
            task_map[row["_id"]] = (row.get("total", 0), row.get("done", 0))
    result = []
    for item in students:
        doc = user_doc_to_public(item).model_dump(mode="json")
        sid = str(item["_id"])
        tot, done = task_map.get(sid, (0, 0))
        doc["tasks_total"] = tot
        doc["tasks_done"] = done
        result.append(doc)
    return JsonResponse(result, safe=False)


async def unassigned(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted for this role", 403)
    query = {"role": "student", "class_advisor_id": None}
    if user.role == Role.ADVISOR:
        query["dept"] = user.dept
    elif user.role == Role.HOD and user.dept:
        query["dept"] = user.dept
    students = [item async for item in users_col.find(query)]
    student_ids = [str(item["_id"]) for item in students]
    task_map = {}
    if student_ids:
        pipeline = [
            {"$match": {"owner_id": {"$in": student_ids}}},
            {"$group": {
                "_id": "$owner_id",
                "total": {"$sum": 1},
                "done": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}}
            }}
        ]
        async for row in tasks_col.aggregate(pipeline):
            task_map[row["_id"]] = (row.get("total", 0), row.get("done", 0))
    result = []
    for item in students:
        doc = user_doc_to_public(item).model_dump(mode="json")
        sid = str(item["_id"])
        tot, done = task_map.get(sid, (0, 0))
        doc["tasks_total"] = tot
        doc["tasks_done"] = done
        result.append(doc)
    return JsonResponse(result, safe=False)


async def hierarchy_candidates(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADMIN, Role.PRINCIPAL, Role.HOD, Role.ADVISOR):
        return _error("Not permitted for this role", 403)
    candidates = [user_doc_to_public(item) async for item in users_col.find({"role": {"$ne": Role.ADMIN.value}})]
    target_role = request.GET.get("target_role")
    if target_role == "hod":
        candidates = [item for item in candidates if item.role != Role.PRINCIPAL]
    elif target_role == "advisor":
        candidates = [item for item in candidates if item.role not in (Role.PRINCIPAL, Role.HOD)]
    elif target_role == "student":
        candidates = [item for item in candidates if item.role == Role.STUDENT and not item.class_advisor_id]
    return JsonResponse([item.model_dump(mode="json") for item in candidates], safe=False)


async def add_existing_student(request, student_id):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADVISOR:
        return _error("Not permitted for this role", 403)
    try:
        object_id = ObjectId(student_id)
        student = await users_col.find_one({"_id": object_id})
    except Exception:
        student = None
    if not student or student.get("role") != Role.STUDENT.value:
        return _error("Student not found", 404)
    if student.get("class_advisor_id"):
        return _error("Student is already mapped to a class", 409)
    await users_col.update_one({"_id": object_id}, {"$set": {"class_advisor_id": user.id, "dept": user.dept}})
    trigger_hierarchy_sync()
    return _public(await users_col.find_one({"_id": object_id}))


async def remove_student(request, student_id):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADVISOR:
        return _error("Not permitted for this role", 403)
    try:
        object_id = ObjectId(student_id)
        student = await users_col.find_one({"_id": object_id})
    except Exception:
        student = None
    if not student or student.get("role") != Role.STUDENT.value:
        return _error("Student not found", 404)
    if student.get("class_advisor_id") != user.id:
        return _error("This student is not in your class", 403)
    await users_col.update_one({"_id": object_id}, {"$set": {"class_advisor_id": None}})
    trigger_hierarchy_sync()
    return _public(await users_col.find_one({"_id": object_id}))


async def update_academic(request, student_id):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted for this role", 403)
    try:
        object_id = ObjectId(student_id)
        student = await users_col.find_one({"_id": object_id})
    except Exception:
        return _error("Invalid student ID format", 400)
    if not student or student.get("role") != Role.STUDENT.value:
        return _error("Student not found", 404)
    if user.role == Role.ADVISOR and student.get("class_advisor_id") != user.id:
        return _error("This student is not in your class", 403)
    serializer = AcademicUpdateSerializer(data=request_data(request) or {})
    if not serializer.is_valid():
        return _error(serializer.errors, 400)
    updates = {key: value for key, value in serializer.validated_data.items() if value is not None}
    if "cgpa" in updates:
        updates["cgpa"] = round(updates["cgpa"], 2)
    if "attendance" in updates:
        updates["attendance"] = round(updates["attendance"], 1)
    if updates:
        await users_col.update_one({"_id": object_id}, {"$set": updates})
        trigger_hierarchy_sync()
    return _public(await users_col.find_one({"_id": object_id}))


async def list_users(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    return JsonResponse([user_doc_to_public(item).model_dump(mode="json") async for item in users_col.find({})], safe=False)


async def admin_user(request, user_id):
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return _error("Invalid user ID format", 400)
    target = await users_col.find_one({"_id": object_id})
    if not target:
        return _error("User not found", 404)
    if request.method == "GET":
        return _public(target)
    if request.method == "DELETE":
        await users_col.delete_one({"_id": object_id})
        trigger_hierarchy_sync()
        return JsonResponse({}, status=204)
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    serializer = ProfileUpdateSerializer(data=request_data(request) or {})
    if not serializer.is_valid():
        return _error(serializer.errors, 400)
    updates = {key: value for key, value in serializer.validated_data.items() if value is not None}
    if updates:
        await users_col.update_one({"_id": object_id}, {"$set": updates})
        trigger_hierarchy_sync()
    return _public(await users_col.find_one({"_id": object_id}))


async def assign_role(request, action):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    allowed = {
        "assign-principal": (Role.ADMIN,),
        "assign-hod": (Role.PRINCIPAL, Role.ADMIN),
        "assign-advisor": (Role.HOD, Role.PRINCIPAL, Role.ADMIN),
        "remove-role": (Role.HOD, Role.PRINCIPAL, Role.ADMIN),
    }
    if action not in allowed or user.role not in allowed[action]:
        return _error("Not permitted for this role", 403)
    serializer_class = {"assign-hod": AssignHodSerializer, "assign-advisor": AssignAdvisorSerializer}.get(action, UserIdSerializer)
    serializer = serializer_class(data=request_data(request) or {})
    if not serializer.is_valid():
        return _error(serializer.errors, 400)
    data = serializer.validated_data
    try:
        object_id = ObjectId(data["user_id"])
    except Exception:
        return _error("Invalid user ID format", 400)
    target = await users_col.find_one({"_id": object_id})
    if not target:
        return _error("User is not registered in CampusFlow. They must sign up first.", 404)
    if action == "assign-principal":
        updates = {"role": Role.PRINCIPAL.value, "dept": "All"}
    elif action == "assign-hod":
        updates = {"role": Role.HOD.value, "dept": data["dept"]}
    elif action == "assign-advisor":
        dept = data.get("dept") if user.role in (Role.PRINCIPAL, Role.ADMIN) else user.dept
        if not dept:
            return _error("Department is required", 400)
        updates = {"role": Role.ADVISOR.value, "dept": dept}
    else:
        updates = {"role": Role.STUDENT.value, "class_advisor_id": None, "dept": None}
    await users_col.update_one({"_id": object_id}, {"$set": updates})
    trigger_hierarchy_sync()
    return _public(await users_col.find_one({"_id": object_id}))


async def change_role(request, user_id):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return _error("Invalid user ID format", 400)
    target = await users_col.find_one({"_id": object_id})
    if not target:
        return _error("User not found", 404)
    serializer = AdminRoleSerializer(data=request_data(request) or {})
    if not serializer.is_valid():
        return _error(serializer.errors, 400)
    data = serializer.validated_data
    updates = {"role": data["role"]}
    if data.get("dept") is not None:
        updates["dept"] = data["dept"]
    elif data["role"] == Role.STUDENT.value and target.get("role") != Role.STUDENT.value:
        updates.update({"dept": None, "class_advisor_id": None})
    elif data["role"] == Role.PRINCIPAL.value:
        updates["dept"] = "All"
    await users_col.update_one({"_id": object_id}, {"$set": updates})
    trigger_hierarchy_sync()
    return _public(await users_col.find_one({"_id": object_id}))


async def daily_attendance(request):
    """
    GET  /advisor/attendance?date=YYYY-MM-DD
         Returns the saved roll call for that date for this advisor.
    POST /advisor/attendance
         Payload: { "date": "YYYY-MM-DD", "records": [ {"student_id": "...", "status": "present"|"absent"|"od"} ] }
         Saves the roll call and computes/updates cumulative student attendance.
    """
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted for this role", 403)

    if request.method == "GET":
        date = request.GET.get("date")
        if not date:
            from datetime import datetime, timezone
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        record = await attendance_col.find_one({"advisor_id": user.id, "date": date})
        if not record:
            return JsonResponse({"date": date, "records": [], "saved": False})
        return JsonResponse({
            "date": date,
            "records": record.get("records", []),
            "saved": True,
            "updated_at": record.get("updated_at"),
        })

    if request.method == "POST":
        data = request_data(request) or {}
        date = data.get("date")
        records = data.get("records", [])
        if not date or not isinstance(records, list):
            return _error("date and records list are required", 400)

        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()

        # Upsert day's attendance
        await attendance_col.update_one(
            {"advisor_id": user.id, "date": date},
            {"$set": {
                "advisor_id": user.id,
                "date": date,
                "records": records,
                "updated_at": now_iso,
            }},
            upsert=True,
        )

        # Recalculate attendance stats for each student marked
        for item in records:
            sid = item.get("student_id")
            if not sid:
                continue
            try:
                s_obj_id = ObjectId(sid)
            except Exception:
                continue

            # Query all attendance sessions marked by this advisor that include this student
            sessions_cursor = attendance_col.find({
                "advisor_id": user.id,
                "records.student_id": sid,
            })
            total_sessions = 0
            attended_sessions = 0
            async for s_doc in sessions_cursor:
                for r in s_doc.get("records", []):
                    if r.get("student_id") == sid:
                        total_sessions += 1
                        if r.get("status") in ("present", "od"):
                            attended_sessions += 1

            if total_sessions > 0:
                pct = round((attended_sessions / total_sessions) * 100, 1)
                await users_col.update_one({"_id": s_obj_id}, {"$set": {"attendance": pct}})

        trigger_hierarchy_sync()
        return JsonResponse({"detail": "Attendance saved successfully", "date": date, "count": len(records)})

    return _error("Method not allowed", 405)


async def warn_attendance(request, student_id):
    """
    POST /advisor/students/<student_id>/warn-attendance
    Dispatches an official shortage alert message to the student via DM.
    """
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted for this role", 403)
    try:
        s_obj_id = ObjectId(student_id)
        student = await users_col.find_one({"_id": s_obj_id})
    except Exception:
        return _error("Invalid student ID format", 400)
    if not student:
        return _error("Student not found", 404)

    att = student.get("attendance", 0)
    name = student.get("name", "Student")
    dm_key = f"dm-{'-'.join(sorted([user.id, student_id]))}"

    from datetime import datetime, timezone
    msg_doc = {
        "group": dm_key,
        "text": f"⚠️ ATTENDANCE WARNING: Dear {name}, your current attendance is {att}%, which is below the mandatory 75% institutional requirement. You are at risk of being barred from semester examinations. Please meet your Class Advisor ({user.name}) immediately.",
        "from_user_id": user.id,
        "from_name": f"{user.name} (Class Advisor)",
        "created_at": datetime.now(timezone.utc),
        "read_by": [],
        "read_count": 0,
        "deleted_for_everyone": False,
    }
    await messages_col.insert_one(msg_doc)
    return JsonResponse({"detail": f"Official attendance shortage warning sent to {name}", "attendance": att})


async def student_attendance_view(request):
    """
    GET /student/attendance
    Returns the logged-in student's cumulative attendance % and their
    individual session records (date, present/absent/od) so the
    student portal can render a history timeline.
    """
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.STUDENT:
        return _error("Only students can use this endpoint", 403)

    uid = user.id
    u_doc = await users_col.find_one({"_id": ObjectId(uid)})
    overall_pct = (u_doc or {}).get("attendance", None)

    # Pull every session that includes this student
    sessions = []
    async for doc in attendance_col.find({"records.student_id": uid}):
        for rec in doc.get("records", []):
            if rec.get("student_id") == uid:
                sessions.append({
                    "date": doc.get("date"),
                    "status": rec.get("status", "absent"),  # present / absent / od
                    "advisor_id": doc.get("advisor_id"),
                })

    # Sort newest first
    sessions.sort(key=lambda s: s["date"] or "", reverse=True)

    # Compute streak (consecutive present days)
    streak = 0
    for s in sessions:
        if s["status"] in ("present", "od"):
            streak += 1
        else:
            break

    total = len(sessions)
    present = sum(1 for s in sessions if s["status"] in ("present", "od"))

    return JsonResponse({
        "overall_pct": overall_pct,
        "total_sessions": total,
        "attended_sessions": present,
        "streak": streak,
        "threshold": 75,
        "sessions": sessions[:30],  # last 30 days max
    })


async def user_settings(request):
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if request.method == "GET":
        u_doc = await users_col.find_one({"_id": ObjectId(user.id)})
        raw_settings = (u_doc or {}).get("settings")
        settings = raw_settings if raw_settings is not None else get_default_settings(user.role.value)
        return JsonResponse(settings)
    if request.method == "PATCH":
        serializer = SettingsUpdateSerializer(data=request_data(request) or {})
        if not serializer.is_valid():
            return _error(serializer.errors, 400)
        updates = {k: v for k, v in serializer.validated_data.items() if v is not None}
        u_doc = await users_col.find_one({"_id": ObjectId(user.id)})
        current_settings = (u_doc or {}).get("settings") or get_default_settings(user.role.value)
        for k, v in updates.items():
            if isinstance(v, dict) and isinstance(current_settings.get(k), dict):
                current_settings[k].update(v)
            else:
                current_settings[k] = v
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"settings": current_settings}})
        trigger_hierarchy_sync()
        return JsonResponse(current_settings)
    return _error("Method not allowed", 405)


async def hierarchy_overview(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    data = read_hierarchy_cached()
    if not data:
        data = await sync_hierarchy_now()
    return JsonResponse(data)


async def hierarchy_sync_action(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADMIN, Role.PRINCIPAL):
        return _error("Not permitted for this role", 403)
    data = await sync_hierarchy_now()
    return JsonResponse({"status": "ok", "total_users": data.get("metadata", {}).get("total_users", 0)})


urlpatterns = [
    path("student/attendance", student_attendance_view),
    path("users/me/settings", user_settings),
    path("users/me", me),
    path("users/directory", directory),
    path("advisor/students", students),
    path("advisor/students/unassigned", unassigned),
    path("advisor/students/<str:student_id>/add", add_existing_student),
    path("advisor/students/<str:student_id>/remove", remove_student),
    path("advisor/students/<str:student_id>/academic", update_academic),
    path("advisor/students/<str:student_id>/warn-attendance", warn_attendance),
    path("advisor/attendance", daily_attendance),
    path("users/hierarchy/candidates", hierarchy_candidates),
    path("users/hierarchy/sync", hierarchy_sync_action),
    path("users/hierarchy", hierarchy_overview),
    path("users/hierarchy/<str:action>", assign_role),
    path("users", list_users),
    path("users/<str:user_id>/role", change_role),
    path("users/<str:user_id>", admin_user),
]

