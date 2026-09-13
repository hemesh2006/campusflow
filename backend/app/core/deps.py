from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from bson import ObjectId
from campusflow.backend.app.core.security import decode_access_token
from campusflow.backend.app.database import users_col
from campusflow.backend.app.models.user import UserPublic, Role

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserPublic:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise credentials_error

    user = await users_col.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise credentials_error

    return user_doc_to_public(user)


def user_doc_to_public(user: dict) -> UserPublic:
    return UserPublic(
        id=str(user["_id"]),
        name=user["name"],
        email=user["email"],
        role=user["role"],
        dept=user.get("dept"),
        class_advisor_id=user.get("class_advisor_id"),
        mobile=user.get("mobile"),
        dob=user.get("dob"),
        year=user.get("year"),
        college=user.get("college"),
        cgpa=user.get("cgpa"),
        attendance=user.get("attendance"),
        semesters=user.get("semesters", []),
        resume_uploaded=user.get("resume_uploaded", False),
        telegram_linked=user.get("telegram_linked", False),
        placement_eligible=user.get("placement_eligible", True),
    )


def require_role(*allowed: Role):
    """Usage: Depends(require_role(Role.ADMIN, Role.HOD))"""
    async def checker(user: UserPublic = Depends(get_current_user)) -> UserPublic:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not permitted for this role")
        return user
    return checker
