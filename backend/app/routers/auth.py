import asyncio
from fastapi import APIRouter, HTTPException, Depends, status
from campusflow.backend.app.database import users_col
from campusflow.backend.app.models.user import UserCreate, UserLogin, UserPublic, Token, resolve_role_from_email
from campusflow.backend.app.core.security import hash_password, verify_password, create_access_token
from campusflow.backend.app.core.deps import get_current_user, user_doc_to_public
from campusflow.backend.app.services import user_knowledge

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=Token)
async def signup(payload: UserCreate):
    existing = await users_col.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Role is resolved automatically — the client never sends one.
    role = resolve_role_from_email(payload.email)

    doc = {
        "name": payload.name,
        "email": payload.email,
        "hashed_password": hash_password(payload.password),
        "role": role.value,
        "dept": payload.dept,
    }
    result = await users_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    user = user_doc_to_public(doc)
    token = create_access_token(subject=str(result.inserted_id), role=role.value)
    asyncio.create_task(user_knowledge.save_snapshot(str(result.inserted_id)))
    return Token(access_token=token, user=user)


@router.post("/login", response_model=Token)
async def login(payload: UserLogin):
    user = await users_col.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    token = create_access_token(subject=str(user["_id"]), role=user["role"])
    public = user_doc_to_public(user)
    asyncio.create_task(user_knowledge.save_snapshot(str(user["_id"])))
    return Token(access_token=token, user=public)


@router.get("/me", response_model=UserPublic)
async def me(current_user: UserPublic = Depends(get_current_user)):
    return current_user
