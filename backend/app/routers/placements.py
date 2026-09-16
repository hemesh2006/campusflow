from typing import Optional, Annotated
from datetime import datetime, timezone
from pydantic import BaseModel, BeforeValidator
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from app.database import placements_col, users_col
from app.core.deps import get_current_user, require_role
from app.models.user import UserPublic, Role

PyObjectId = Annotated[str, BeforeValidator(str)]


class PlacementTask(BaseModel):
    title: str
    done: bool = False


class PlacementCreate(BaseModel):
    company: str
    role: str
    package: Optional[str] = None
    deadline: str
    status: str = "action_needed"  # action_needed | applied | closed
    tasks: list[PlacementTask] = []
    completed: bool = False
    completed_at: Optional[str] = None


class PlacementUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    package: Optional[str] = None
    deadline: Optional[str] = None
    status: Optional[str] = None


class PlacementOut(PlacementCreate):
    id: PyObjectId
    owner_id: str


def _to_out(p: dict) -> "PlacementOut":
    return PlacementOut(id=str(p["_id"]), owner_id=p["owner_id"], company=p["company"], role=p["role"],
                         package=p.get("package"), deadline=p["deadline"], status=p["status"],
                         tasks=p.get("tasks", []), completed=p.get("completed", False),
                         completed_at=p.get("completed_at"))


class PlacementStudentStatus(BaseModel):
    student_id: str
    student_name: str
    student_email: str
    completed: bool
    completed_at: Optional[str] = None
    tasks: list[PlacementTask] = []


class PlacementDriveSummary(BaseModel):
    company: str
    role: str
    package: Optional[str] = None
    deadline: str
    total_students: int
    completed_count: int
    students: list[PlacementStudentStatus] = []


router = APIRouter(prefix="/placements", tags=["placements"])


@router.get("", response_model=list[PlacementOut])
async def list_placements(current_user: UserPublic = Depends(get_current_user)):
    cursor = placements_col.find({"owner_id": current_user.id})
    return [_to_out(p) async for p in cursor]


@router.post("", response_model=PlacementOut, status_code=status.HTTP_201_CREATED)
async def create_placement(payload: PlacementCreate, current_user: UserPublic = Depends(get_current_user)):
    doc = {**payload.model_dump(), "owner_id": current_user.id}
    result = await placements_col.insert_one(doc)
    return PlacementOut(id=str(result.inserted_id), **doc)


async def _get_owned(placement_id: str, current_user: UserPublic) -> dict:
    placement = await placements_col.find_one({"_id": ObjectId(placement_id), "owner_id": current_user.id})
    if not placement:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Placement not found")
    return placement


@router.patch("/{placement_id}", response_model=PlacementOut)
async def update_placement(placement_id: str, payload: PlacementUpdate, current_user: UserPublic = Depends(get_current_user)):
    placement = await _get_owned(placement_id, current_user)
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        await placements_col.update_one({"_id": placement["_id"]}, {"$set": updates})
        placement.update(updates)
    return _to_out(placement)


@router.delete("/{placement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_placement(placement_id: str, current_user: UserPublic = Depends(get_current_user)):
    result = await placements_col.delete_one({"_id": ObjectId(placement_id), "owner_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Placement not found")


@router.patch("/{placement_id}/tasks/{task_index}", response_model=PlacementOut)
async def toggle_placement_task(placement_id: str, task_index: int, done: bool, current_user: UserPublic = Depends(get_current_user)):
    placement = await _get_owned(placement_id, current_user)
    tasks = placement.get("tasks", [])
    if task_index < 0 or task_index >= len(tasks):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    tasks[task_index]["done"] = done
    await placements_col.update_one({"_id": placement["_id"]}, {"$set": {"tasks": tasks}})
    placement["tasks"] = tasks
    return _to_out(placement)


@router.post("/{placement_id}/complete", response_model=PlacementOut)
async def complete_placement(placement_id: str, current_user: UserPublic = Depends(get_current_user)):
    """Student-facing "Completed Action" button: marks every task on this
    drive as done and stamps the placement as completed. This is what
    feeds the class advisor's placement-completion summary below."""
    placement = await _get_owned(placement_id, current_user)
    tasks = placement.get("tasks", [])
    for t in tasks:
        t["done"] = True
    completed_at = datetime.now(timezone.utc).isoformat()
    updates = {"tasks": tasks, "completed": True, "completed_at": completed_at}
    await placements_col.update_one({"_id": placement["_id"]}, {"$set": updates})
    placement.update(updates)
    return _to_out(placement)


@router.get("/advisor/summary", response_model=list[PlacementDriveSummary])
async def advisor_placement_summary(
    current_user: UserPublic = Depends(require_role(Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN)),
):
    """Class-advisor-facing view: every placement drive, how many of the
    advisor's students have hit "Completed Action", and each student's
    round-by-round / test-registration task breakdown. Scoped to students
    in the advisor's own department (admin sees every department)."""
    student_query = {"role": Role.STUDENT.value}
    if current_user.role != Role.ADMIN and current_user.dept:
        student_query["dept"] = current_user.dept

    students_by_id = {}
    async for u in users_col.find(student_query):
        students_by_id[str(u["_id"])] = u

    if not students_by_id:
        return []

    drives: dict[tuple[str, str], dict] = {}
    cursor = placements_col.find({"owner_id": {"$in": list(students_by_id.keys())}})
    async for p in cursor:
        student = students_by_id.get(p["owner_id"])
        if not student:
            continue
        key = (p["company"], p["role"])
        if key not in drives:
            drives[key] = {
                "company": p["company"], "role": p["role"], "package": p.get("package"),
                "deadline": p["deadline"], "students": [],
            }
        drives[key]["students"].append(PlacementStudentStatus(
            student_id=p["owner_id"],
            student_name=student["name"],
            student_email=student["email"],
            completed=p.get("completed", False),
            completed_at=p.get("completed_at"),
            tasks=p.get("tasks", []),
        ))

    summaries = []
    for d in drives.values():
        completed_count = sum(1 for s in d["students"] if s.completed)
        summaries.append(PlacementDriveSummary(
            company=d["company"], role=d["role"], package=d["package"], deadline=d["deadline"],
            total_students=len(d["students"]), completed_count=completed_count, students=d["students"],
        ))
    return summaries
