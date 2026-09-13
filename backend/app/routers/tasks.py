from typing import Optional, Annotated
from pydantic import BaseModel, BeforeValidator
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from campusflow.backend.app.database import tasks_col
from campusflow.backend.app.core.deps import get_current_user
from campusflow.backend.app.models.user import UserPublic

PyObjectId = Annotated[str, BeforeValidator(str)]


class TaskCreate(BaseModel):
    title: str
    due: str
    agent: Optional[str] = None
    status: str = "pending"  # pending | in_progress | done


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    due: Optional[str] = None


class TaskOut(TaskCreate):
    id: PyObjectId
    owner_id: str


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(current_user: UserPublic = Depends(get_current_user)):
    cursor = tasks_col.find({"owner_id": current_user.id})
    return [TaskOut(id=str(t["_id"]), owner_id=t["owner_id"], title=t["title"], due=t["due"], agent=t.get("agent"), status=t["status"]) async for t in cursor]


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, current_user: UserPublic = Depends(get_current_user)):
    doc = {**payload.model_dump(), "owner_id": current_user.id}
    result = await tasks_col.insert_one(doc)
    return TaskOut(id=str(result.inserted_id), **doc)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, payload: TaskUpdate, current_user: UserPublic = Depends(get_current_user)):
    task = await tasks_col.find_one({"_id": ObjectId(task_id), "owner_id": current_user.id})
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await tasks_col.update_one({"_id": ObjectId(task_id)}, {"$set": updates})
        task.update(updates)

    return TaskOut(id=str(task["_id"]), owner_id=task["owner_id"], title=task["title"], due=task["due"], agent=task.get("agent"), status=task["status"])
