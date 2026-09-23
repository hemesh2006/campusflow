from bson import ObjectId
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from app.core.security import decode_access_token
from app.database import users_col
from app.models.user import UserPublic, Role

async def get_current_user(request) -> UserPublic:
    credentials_error = NotAuthenticated("Could not validate credentials")
    authorization = request.headers.get("Authorization", "")
    token = authorization.removeprefix("Bearer ").strip()
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
    async def checker(user: UserPublic) -> UserPublic:
        if user.role not in allowed:
            raise PermissionDenied("Not permitted for this role")
        return user
    return checker
