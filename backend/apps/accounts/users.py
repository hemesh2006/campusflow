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
    StudentCreateSerializer,
    UserIdSerializer,
)
from app.core.deps import get_current_user, user_doc_to_public
from app.core.security import hash_password
from app.database import users_col
from app.models.user import Role


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
    return JsonResponse([user_doc_to_public(item).model_dump(mode="json") async for item in users_col.find(query)], safe=False)


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
    return JsonResponse([user_doc_to_public(item).model_dump(mode="json") async for item in users_col.find(query)], safe=False)


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
        return JsonResponse({}, status=204)
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    serializer = ProfileUpdateSerializer(data=request_data(request) or {})
    if not serializer.is_valid():
        return _error(serializer.errors, 400)
    updates = {key: value for key, value in serializer.validated_data.items() if value is not None}
    if updates:
        await users_col.update_one({"_id": object_id}, {"$set": updates})
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
    return _public(await users_col.find_one({"_id": object_id}))


urlpatterns = [
    path("users/me", me),
    path("users/directory", directory),
    path("advisor/students", students),
    path("advisor/students/unassigned", unassigned),
    path("advisor/students/<str:student_id>/add", add_existing_student),
    path("advisor/students/<str:student_id>/remove", remove_student),
    path("advisor/students/<str:student_id>/academic", update_academic),
    path("users/hierarchy/candidates", hierarchy_candidates),
    path("users/hierarchy/<str:action>", assign_role),
    path("users", list_users),
    path("users/<str:user_id>/role", change_role),
    path("users/<str:user_id>", admin_user),
]
