"""Institution-wide read-only aggregates for the Principal and HOD
dashboards. Nothing here is stored separately — every number is computed
live from users_col / tasks_col / agents_col / messages_col, the same
collections students and advisors already write to. Replaces the
DEPT_OVERVIEW, INSTITUTION_SUMMARY, STAFF_INVOLVEMENT and
COMPLETION_BY_STUDENT mock data. See info.md."""
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends

from campusflow.backend.app.database import users_col, tasks_col, agents_col, messages_col
from campusflow.backend.app.core.deps import require_role
from campusflow.backend.app.models.user import UserPublic, Role

router = APIRouter(prefix="/overview", tags=["overview"])


class DeptOverview(BaseModel):
    dept: str
    students: int
    advisors: int
    agents_running: int
    avg_completion: float  # 0-100, avg task completion % across the dept's students


class InstitutionSummary(BaseModel):
    total_students: int
    total_departments: int
    overall_completion_rate: float
    messages_this_week: int


class StaffActivity(BaseModel):
    name: str
    role: str
    dept: Optional[str] = None
    messages_sent: int
    tasks_reviewed: int  # completed tasks among the staff member's scoped students
    activity: float       # 0-100 composite score — see note below


class StudentCompletion(BaseModel):
    name: str
    dept: Optional[str] = None
    rate: float  # 0-100


async def _student_ids_for_dept(dept: str) -> list[str]:
    ids = []
    async for u in users_col.find({"role": Role.STUDENT.value, "dept": dept}, {"_id": 1}):
        ids.append(str(u["_id"]))
    return ids


async def _completion_rate(owner_ids: list[str]) -> float:
    """Task completion % across a set of student owner_ids. Students with
    zero tasks show as 0% — this is real data, not a placeholder, so an
    empty task list genuinely reads as "nothing completed yet" rather
    than being hidden or faked as 100%."""
    if not owner_ids:
        return 0.0
    total = await tasks_col.count_documents({"owner_id": {"$in": owner_ids}})
    if total == 0:
        return 0.0
    done = await tasks_col.count_documents({"owner_id": {"$in": owner_ids}, "status": "done"})
    return round(done / total * 100, 1)


@router.get("/departments", response_model=list[DeptOverview])
async def departments_overview(
    current_user: UserPublic = Depends(require_role(Role.PRINCIPAL, Role.HOD, Role.ADMIN)),
):
    depts = await users_col.distinct("dept", {"dept": {"$nin": [None, "All"]}})
    out = []
    for d in sorted(depts):
        student_ids = await _student_ids_for_dept(d)
        advisors = await users_col.count_documents({"role": Role.ADVISOR.value, "dept": d})
        staff_ids = list(student_ids)
        async for u in users_col.find({"dept": d, "role": {"$in": ["advisor", "hod"]}}, {"_id": 1}):
            staff_ids.append(str(u["_id"]))
        agents_running = await agents_col.count_documents({"owner_id": {"$in": staff_ids}, "status": "running"})
        avg_completion = await _completion_rate(student_ids)
        out.append(DeptOverview(
            dept=d, students=len(student_ids), advisors=advisors,
            agents_running=agents_running, avg_completion=avg_completion,
        ))
    return out


@router.get("/institution", response_model=InstitutionSummary)
async def institution_summary(
    current_user: UserPublic = Depends(require_role(Role.PRINCIPAL, Role.ADMIN)),
):
    total_students = await users_col.count_documents({"role": Role.STUDENT.value})
    total_departments = len(await users_col.distinct("dept", {"dept": {"$nin": [None, "All"]}}))
    all_student_ids = [str(u["_id"]) async for u in users_col.find({"role": Role.STUDENT.value}, {"_id": 1})]
    overall_completion_rate = await _completion_rate(all_student_ids)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    messages_this_week = await messages_col.count_documents({"created_at": {"$gte": week_ago}})
    return InstitutionSummary(
        total_students=total_students,
        total_departments=total_departments,
        overall_completion_rate=overall_completion_rate,
        messages_this_week=messages_this_week,
    )


@router.get("/staff-activity", response_model=list[StaffActivity])
async def staff_activity(
    current_user: UserPublic = Depends(require_role(Role.PRINCIPAL, Role.HOD, Role.ADMIN)),
):
    """Principal sees every advisor + HOD; a HOD only sees their own
    department's advisors (plus themself)."""
    query = {"role": {"$in": ["advisor", "hod"]}}
    if current_user.role == Role.HOD and current_user.dept:
        query["dept"] = current_user.dept
    out = []
    async for u in users_col.find(query):
        uid = str(u["_id"])
        messages_sent = await messages_col.count_documents({"from_user_id": uid})
        if u["role"] == "advisor":
            scoped_ids = [s async for s in users_col.find({"role": "student", "class_advisor_id": uid}, {"_id": 1})]
            scoped_ids = [str(s["_id"]) for s in scoped_ids]
        else:
            scoped_ids = await _student_ids_for_dept(u["dept"]) if u.get("dept") else []
        tasks_reviewed = await tasks_col.count_documents({"owner_id": {"$in": scoped_ids}, "status": "done"}) if scoped_ids else 0
        # Lightweight composite so the activity bar has something to show —
        # not a claimed ML score, just messages + completed-task weight,
        # capped at 100.
        activity = round(min(100, messages_sent * 3 + tasks_reviewed * 2), 1)
        out.append(StaffActivity(
            name=u["name"],
            role=f"{'HOD' if u['role'] == 'hod' else 'Advisor'} · {u.get('dept', '')}",
            dept=u.get("dept"),
            messages_sent=messages_sent,
            tasks_reviewed=tasks_reviewed,
            activity=activity,
        ))
    return out


@router.get("/completion-by-student", response_model=list[StudentCompletion])
async def completion_by_student(
    current_user: UserPublic = Depends(require_role(Role.PRINCIPAL, Role.HOD, Role.ADMIN)),
):
    """Principal sees all students; a HOD is scoped to their own dept."""
    query = {"role": Role.STUDENT.value}
    if current_user.role == Role.HOD and current_user.dept:
        query["dept"] = current_user.dept
    out = []
    async for u in users_col.find(query):
        rate = await _completion_rate([str(u["_id"])])
        out.append(StudentCompletion(name=u["name"], dept=u.get("dept"), rate=rate))
    return out
