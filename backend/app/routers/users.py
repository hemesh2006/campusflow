from bson import ObjectId
from typing import Optional
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, status
from campusflow.backend.app.database import users_col, tasks_col
from campusflow.backend.app.core.deps import get_current_user, require_role, user_doc_to_public
from campusflow.backend.app.models.user import (
    UserPublic, UserProfileUpdate, Role,
    AssignPrincipalPayload, AssignHodPayload, AssignAdvisorPayload, RemoveRolePayload, AdminUserRoleUpdate,
    StudentAcademicUpdate,
)
from campusflow.backend.app.core.security import hash_password



router = APIRouter(tags=["users"])


class StudentCreate(BaseModel):
    name: str
    email: EmailStr
    roll_id: Optional[str] = None
    dept: Optional[str] = None


class AdvisorStudentOut(UserPublic):
    """UserPublic plus a live task-completion count, computed from tasks_col.
    Powers the roster progress bars on the Advisor Dashboard and the
    expanded task summary on the Advisor Students page."""
    tasks_done: int = 0
    tasks_total: int = 0


async def _to_advisor_student_out(u: dict) -> AdvisorStudentOut:
    pub = user_doc_to_public(u)
    total = await tasks_col.count_documents({"owner_id": pub.id})
    done = await tasks_col.count_documents({"owner_id": pub.id, "status": "done"})
    return AdvisorStudentOut(**pub.model_dump(), tasks_done=done, tasks_total=total)


class DirectoryUser(BaseModel):
    """Slim, non-sensitive projection of a user — just enough to power
    @mention search and "message this person" everywhere in the app.
    Deliberately excludes grades/attendance/etc; every authenticated
    role can see this list, unlike the full /users endpoint (admin-only)."""
    id: str
    name: str
    email: EmailStr
    role: Role
    dept: Optional[str] = None


@router.get("/users/me", response_model=UserPublic)
async def get_my_profile(current_user: UserPublic = Depends(get_current_user)):
    return current_user


@router.patch("/users/me", response_model=UserPublic)
async def update_my_profile(payload: UserProfileUpdate, current_user: UserPublic = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        if "semesters" in updates:
            updates["semesters"] = [s if isinstance(s, dict) else s.model_dump() for s in updates["semesters"]]
        await users_col.update_one({"_id": ObjectId(current_user.id)}, {"$set": updates})
    user = await users_col.find_one({"_id": ObjectId(current_user.id)})
    return user_doc_to_public(user)


# --- Directory: lightweight "everyone in the system" list, open to any
# logged-in role — powers @mention autocomplete and "message anyone"
# from the group chats and the Messages page. -------------------------------

@router.get("/users/directory", response_model=list[DirectoryUser])
async def list_directory(current_user: UserPublic = Depends(get_current_user)):
    cursor = users_col.find({"_id": {"$ne": ObjectId(current_user.id)}})
    return [
        DirectoryUser(id=str(u["_id"]), name=u["name"], email=u["email"], role=u["role"], dept=u.get("dept"))
        async for u in cursor
    ]


# --- Advisor: students in their class ------------------------------------

@router.get("/advisor/students", response_model=list[AdvisorStudentOut])
async def list_my_students(current_user: UserPublic = Depends(require_role(Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN))):
    """Returns the students actually mapped into this advisor's class
    (class_advisor_id == the advisor's own id) - not just "same department",
    since a student who has signed up isn't in anyone's class until an
    advisor explicitly adds them. HOD / Principal / Admin get every
    student in the system (oversight view, not a specific class)."""
    if current_user.role in (Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        query = {"role": "student"}
    else:
        query = {"role": "student", "class_advisor_id": current_user.id}
    cursor = users_col.find(query)
    return [await _to_advisor_student_out(u) async for u in cursor]


@router.get("/advisor/students/unassigned", response_model=list[AdvisorStudentOut])
async def list_unassigned_students(current_user: UserPublic = Depends(require_role(Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN))):
    """Students who have registered (signed up) but aren't yet mapped to
    any class advisor - the pool an advisor picks new class members from.
    Advisors only see candidates from their own department; HOD/Principal/
    Admin see every unassigned student across departments."""
    query = {"role": "student", "class_advisor_id": None}
    if current_user.role == Role.ADVISOR:
        query["dept"] = current_user.dept
    cursor = users_col.find(query)
    return [await _to_advisor_student_out(u) async for u in cursor]


@router.post("/advisor/students/{student_id}/add", response_model=UserPublic)
async def add_existing_student_to_class(student_id: str, current_user: UserPublic = Depends(require_role(Role.ADVISOR))):
    """Maps an already-registered student into the calling advisor's class.
    Refuses if the student doesn't exist, isn't a student, or is already
    mapped to a class (their own or someone else's) - add is for the
    unassigned pool only; use /remove first to move a student between
    classes."""
    student = await users_col.find_one({"_id": ObjectId(student_id)})
    if not student or student.get("role") != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    if student.get("class_advisor_id"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Student is already mapped to a class")
    await users_col.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {"class_advisor_id": current_user.id, "dept": current_user.dept}},
    )
    updated = await users_col.find_one({"_id": ObjectId(student_id)})
    return user_doc_to_public(updated)


@router.post("/advisor/students/{student_id}/remove", response_model=UserPublic)
async def remove_student_from_class(student_id: str, current_user: UserPublic = Depends(require_role(Role.ADVISOR))):
    """Unmaps a student from the calling advisor's class, sending them
    back to the unassigned pool. Only the advisor the student is
    currently mapped to can remove them - prevents one advisor detaching
    another advisor's students."""
    student = await users_col.find_one({"_id": ObjectId(student_id)})
    if not student or student.get("role") != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    if student.get("class_advisor_id") != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This student is not in your class")
    await users_col.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {"class_advisor_id": None}},
    )
    updated = await users_col.find_one({"_id": ObjectId(student_id)})
    return user_doc_to_public(updated)


@router.patch("/advisor/students/{student_id}/academic", response_model=UserPublic)
async def update_student_academic_records(
    student_id: str,
    payload: StudentAcademicUpdate,
    current_user: UserPublic = Depends(require_role(Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN))
):
    """Allows Class Advisor (or HOD/Admin) to manually enter/update CGPA and Attendance for a student."""
    try:
        obj_id = ObjectId(student_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid student ID format")

    student = await users_col.find_one({"_id": obj_id})
    if not student or student.get("role") != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")

    if current_user.role == Role.ADVISOR and student.get("class_advisor_id") != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This student is not in your class")

    updates = {}
    if payload.cgpa is not None:
        updates["cgpa"] = round(payload.cgpa, 2)
    if payload.attendance is not None:
        updates["attendance"] = round(payload.attendance, 1)

    if updates:
        await users_col.update_one({"_id": obj_id}, {"$set": updates})

    updated = await users_col.find_one({"_id": obj_id})
    return user_doc_to_public(updated)



@router.post("/advisor/students", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def add_student(payload: StudentCreate, current_user: UserPublic = Depends(require_role(Role.ADVISOR, Role.HOD, Role.ADMIN))):
    """Legacy path: creates a brand-new student account directly (default
    password) and maps them straight into the caller's class. Kept for
    HOD/Admin onboarding edge cases, but the advisor UI no longer uses
    this by default - students are expected to self-register via Sign up,
    then get picked from the unassigned pool via POST /advisor/students/id/add."""
    existing = await users_col.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    dept = payload.dept or current_user.dept
    doc = {
        "name": payload.name,
        "email": payload.email,
        "hashed_password": hash_password("password123"),
        "role": "student",
        "dept": dept,
        "class_advisor_id": current_user.id if current_user.role == Role.ADVISOR else None,
        "roll_id": payload.roll_id,
        "attendance": 100,
        "fairness": 0.2,
        "semesters": [],
        "placement_eligible": True,
    }
    result = await users_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return user_doc_to_public(doc)


# --- Admin-only user management -------------------------------------------------

@router.get("/users", response_model=list[UserPublic], dependencies=[Depends(require_role(Role.ADMIN))])
async def list_users():
    cursor = users_col.find({})
    return [user_doc_to_public(u) async for u in cursor]


@router.get("/users/{user_id}", response_model=UserPublic, dependencies=[Depends(require_role(Role.ADMIN))])
async def get_user(user_id: str):
    user = await users_col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user_doc_to_public(user)


@router.patch("/users/{user_id}", response_model=UserPublic, dependencies=[Depends(require_role(Role.ADMIN))])
async def admin_update_user(user_id: str, payload: UserProfileUpdate):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        if "semesters" in updates:
            updates["semesters"] = [s if isinstance(s, dict) else s.model_dump() for s in updates["semesters"]]
        await users_col.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    user = await users_col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user_doc_to_public(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role(Role.ADMIN))])
async def delete_user(user_id: str):
    result = await users_col.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")


# --- Institutional Hierarchy Assignment Endpoints -----------------------------

@router.get("/users/hierarchy/candidates", response_model=list[UserPublic])
async def list_hierarchy_candidates(
    target_role: Optional[str] = None,
    current_user: UserPublic = Depends(require_role(Role.ADMIN, Role.PRINCIPAL, Role.HOD, Role.ADVISOR))
):
    """Returns registered users in the database available for role assignment in the hierarchy.
    Ensures that superiors pick existing registered users rather than creating dummy accounts."""
    query = {"role": {"$ne": Role.ADMIN.value}}
    cursor = users_col.find(query)
    users = [user_doc_to_public(u) async for u in cursor]
    if target_role:
        if target_role == "principal":
            return users
        elif target_role == "hod":
            return [u for u in users if u.role != Role.PRINCIPAL]
        elif target_role == "advisor":
            return [u for u in users if u.role not in (Role.PRINCIPAL, Role.HOD)]
        elif target_role == "student":
            return [u for u in users if u.role == Role.STUDENT and not u.class_advisor_id]
    return users


@router.post("/users/hierarchy/assign-principal", response_model=UserPublic)
async def assign_principal(
    payload: AssignPrincipalPayload,
    current_user: UserPublic = Depends(require_role(Role.ADMIN))
):
    """Admin assigns an ALREADY REGISTERED user as Principal."""
    try:
        obj_id = ObjectId(payload.user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID format")

    user = await users_col.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User is not registered in CampusFlow. They must sign up first.")

    await users_col.update_one(
        {"_id": obj_id},
        {"$set": {"role": Role.PRINCIPAL.value, "dept": "All"}}
    )
    updated = await users_col.find_one({"_id": obj_id})
    return user_doc_to_public(updated)


@router.post("/users/hierarchy/assign-hod", response_model=UserPublic)
async def assign_hod(
    payload: AssignHodPayload,
    current_user: UserPublic = Depends(require_role(Role.PRINCIPAL, Role.ADMIN))
):
    """Principal assigns an ALREADY REGISTERED user as HOD for a department."""
    try:
        obj_id = ObjectId(payload.user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID format")

    user = await users_col.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User is not registered in CampusFlow. They must sign up first.")

    await users_col.update_one(
        {"_id": obj_id},
        {"$set": {"role": Role.HOD.value, "dept": payload.dept}}
    )
    updated = await users_col.find_one({"_id": obj_id})
    return user_doc_to_public(updated)


@router.post("/users/hierarchy/assign-advisor", response_model=UserPublic)
async def assign_advisor(
    payload: AssignAdvisorPayload,
    current_user: UserPublic = Depends(require_role(Role.HOD, Role.PRINCIPAL, Role.ADMIN))
):
    """HOD assigns an ALREADY REGISTERED user as Class Advisor for their department."""
    try:
        obj_id = ObjectId(payload.user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID format")

    user = await users_col.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User is not registered in CampusFlow. They must sign up first.")

    dept = payload.dept if current_user.role in (Role.PRINCIPAL, Role.ADMIN) else current_user.dept
    if not dept:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Department is required")

    await users_col.update_one(
        {"_id": obj_id},
        {"$set": {"role": Role.ADVISOR.value, "dept": dept}}
    )
    updated = await users_col.find_one({"_id": obj_id})
    return user_doc_to_public(updated)


@router.post("/users/hierarchy/remove-role", response_model=UserPublic)
async def remove_hierarchy_role(
    payload: RemoveRolePayload,
    current_user: UserPublic = Depends(require_role(Role.HOD, Role.PRINCIPAL, Role.ADMIN))
):
    """Demotes/unassigns a user from a hierarchy role back to student/unassigned."""
    try:
        obj_id = ObjectId(payload.user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID format")

    user = await users_col.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    await users_col.update_one(
        {"_id": obj_id},
        {"$set": {"role": Role.STUDENT.value, "class_advisor_id": None, "dept": None}}
    )
    updated = await users_col.find_one({"_id": obj_id})
    return user_doc_to_public(updated)


@router.patch("/users/{user_id}/role", response_model=UserPublic, dependencies=[Depends(require_role(Role.ADMIN))])
async def admin_change_user_role(user_id: str, payload: AdminUserRoleUpdate):
    """Admin can manually change the role and department for any registered user."""
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID format")

    user = await users_col.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    updates = {"role": payload.role.value}
    if payload.dept is not None:
        updates["dept"] = payload.dept
    elif payload.role == Role.STUDENT and user.get("role") != "student":
        updates["dept"] = None
        updates["class_advisor_id"] = None
    elif payload.role == Role.PRINCIPAL:
        updates["dept"] = "All"

    await users_col.update_one({"_id": obj_id}, {"$set": updates})
    updated = await users_col.find_one({"_id": obj_id})
    return user_doc_to_public(updated)


