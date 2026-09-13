"""Knowledge snapshot API
==========================
Endpoints for building, refreshing and reading per-user JSON knowledge
snapshots. These snapshots are stored at backend/data/knowledge/<user_id>.json
and are consumed by the LLM personal assistant to answer questions about
the user's current state without needing live DB access on every chat turn.

Routes
------
POST /knowledge/refresh
    Build (or rebuild) the caller's own snapshot immediately.
    Also called automatically by auth/tasks/messages mutations.

GET  /knowledge/me
    Return the caller's snapshot as JSON (for debugging / frontend use).

GET  /knowledge/me/context
    Return the snapshot as a compact context string for LLM injection.

POST /knowledge/admin/refresh/{user_id}   (admin only)
    Force-refresh any user's snapshot.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from campusflow.backend.app.core.deps import get_current_user, require_role
from campusflow.backend.app.models.user import UserPublic, Role
from campusflow.backend.app.services import user_knowledge

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/refresh", summary="Rebuild caller's knowledge snapshot")
async def refresh_my_snapshot(current_user: UserPublic = Depends(get_current_user)):
    """Trigger an immediate rebuild of the knowledge JSON for the logged-in user."""
    try:
        snapshot = await user_knowledge.save_snapshot(current_user.id)
        return {
            "status": "ok",
            "user_id": current_user.id,
            "generated_at": snapshot["meta"]["generated_at"],
            "stats": snapshot["stats"],
        }
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Snapshot failed: {e}")


@router.get("/me", summary="Get caller's full knowledge snapshot")
async def get_my_snapshot(current_user: UserPublic = Depends(get_current_user)):
    """Return the last persisted snapshot for the logged-in user.
    If none exists, builds one on the fly."""
    snap = user_knowledge.load_snapshot(current_user.id)
    if not snap:
        snap = await user_knowledge.save_snapshot(current_user.id)
    return snap


@router.get("/me/context", summary="Get snapshot as LLM context string")
async def get_my_context(current_user: UserPublic = Depends(get_current_user)):
    """Return a compact JSON string suitable for injecting into an LLM system prompt."""
    ctx = user_knowledge.snapshot_as_context_string(current_user.id)
    if not ctx:
        await user_knowledge.save_snapshot(current_user.id)
        ctx = user_knowledge.snapshot_as_context_string(current_user.id)
    return {"context": ctx}


@router.post("/admin/refresh/{user_id}", summary="Admin: force-refresh any user's snapshot")
async def admin_refresh(
    user_id: str,
    _admin: UserPublic = Depends(require_role(Role.ADMIN)),
):
    """Admin-only: rebuild the knowledge JSON for any user by their ID."""
    try:
        snapshot = await user_knowledge.save_snapshot(user_id)
        return {
            "status": "ok",
            "user_id": user_id,
            "generated_at": snapshot["meta"]["generated_at"],
            "stats": snapshot["stats"],
        }
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Snapshot failed: {e}")
