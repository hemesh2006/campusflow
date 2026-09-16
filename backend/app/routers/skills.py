from typing import Optional, Annotated
from pydantic import BaseModel, BeforeValidator
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from app.database import skills_col
from app.core.deps import get_current_user
from app.models.user import UserPublic

PyObjectId = Annotated[str, BeforeValidator(str)]


class SkillTopic(BaseModel):
    name: str
    score: float


class SkillCreate(BaseModel):
    skill: str
    level: float
    topics: list[SkillTopic] = []
    trend: list[float] = []


class SkillUpdate(BaseModel):
    level: Optional[float] = None
    topics: Optional[list[SkillTopic]] = None
    trend: Optional[list[float]] = None


class SkillOut(SkillCreate):
    id: PyObjectId
    owner_id: str


router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("/me", response_model=list[SkillOut])
async def list_my_skills(current_user: UserPublic = Depends(get_current_user)):
    cursor = skills_col.find({"owner_id": current_user.id})
    return [
        SkillOut(id=str(s["_id"]), owner_id=s["owner_id"], skill=s["skill"], level=s["level"],
                 topics=s.get("topics", []), trend=s.get("trend", []))
        async for s in cursor
    ]


@router.post("", response_model=SkillOut, status_code=status.HTTP_201_CREATED)
async def create_skill(payload: SkillCreate, current_user: UserPublic = Depends(get_current_user)):
    doc = {**payload.model_dump(), "owner_id": current_user.id}
    result = await skills_col.insert_one(doc)
    return SkillOut(id=str(result.inserted_id), **doc)


@router.patch("/{skill_id}", response_model=SkillOut)
async def update_skill(skill_id: str, payload: SkillUpdate, current_user: UserPublic = Depends(get_current_user)):
    skill = await skills_col.find_one({"_id": ObjectId(skill_id), "owner_id": current_user.id})
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        await skills_col.update_one({"_id": ObjectId(skill_id)}, {"$set": updates})
        skill.update(updates)
    return SkillOut(id=str(skill["_id"]), owner_id=skill["owner_id"], skill=skill["skill"], level=skill["level"],
                     topics=skill.get("topics", []), trend=skill.get("trend", []))


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(skill_id: str, current_user: UserPublic = Depends(get_current_user)):
    result = await skills_col.delete_one({"_id": ObjectId(skill_id), "owner_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill not found")
