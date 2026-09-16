"""
Developer-only bypass login.

Lets the frontend list every seeded user and mint a real JWT for any
of them WITHOUT a password — so you can test student / advisor / hod /
principal / admin views instantly while building.

Safety:
- Every route here 403s unless settings.dev_mode is True.
- dev_mode defaults to False (see app/config.py) and must be turned on
  explicitly via DEV_MODE=true in backend/.env.
- NEVER set DEV_MODE=true in a deployed/production environment — this
  endpoint hands out a valid session for any account with zero auth.
"""
from fastapi import APIRouter, HTTPException, status
from app.config import settings
from app.database import users_col
from app.models.user import Token
from app.core.security import create_access_token
from app.core.deps import user_doc_to_public

router = APIRouter(prefix="/dev", tags=["dev"])


def _guard():
    if not settings.dev_mode:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Dev bypass is disabled (set DEV_MODE=true in backend/.env)")


@router.get("/users")
async def list_dev_users():
    """Every seeded/created user, grouped by role, for the bypass picker."""
    _guard()
    cursor = users_col.find({})
    out = []
    async for u in cursor:
        out.append({
            "id": str(u["_id"]),
            "name": u["name"],
            "email": u["email"],
            "role": u["role"],
            "dept": u.get("dept"),
        })
    return out


@router.post("/login/{user_id}", response_model=Token)
async def dev_login(user_id: str):
    """Issue a real JWT for the given user id — no password required."""
    _guard()
    from bson import ObjectId
    try:
        user = await users_col.find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = None
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    token = create_access_token(subject=str(user["_id"]), role=user["role"])
    return Token(access_token=token, user=user_doc_to_public(user))
