from django.http import JsonResponse
from django.urls import path

from app.core.deps import get_current_user
from app.models.user import Role
from app.services import user_knowledge


def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


async def refresh(request):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    try:
        snapshot = await user_knowledge.save_snapshot(user.id)
        return JsonResponse({"status": "ok", "user_id": user.id, "generated_at": snapshot["meta"]["generated_at"], "stats": snapshot["stats"]})
    except Exception as exc:
        return _error(f"Snapshot failed: {exc}", 500)


async def mine(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    snapshot = user_knowledge.load_snapshot(user.id)
    if not snapshot:
        snapshot = await user_knowledge.save_snapshot(user.id)
    return JsonResponse(snapshot)


async def context(request):
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    value = user_knowledge.snapshot_as_context_string(user.id)
    if not value:
        await user_knowledge.save_snapshot(user.id)
        value = user_knowledge.snapshot_as_context_string(user.id)
    return JsonResponse({"context": value})


async def admin_refresh(request, user_id):
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    try:
        snapshot = await user_knowledge.save_snapshot(user_id)
        return JsonResponse({"status": "ok", "user_id": user_id, "generated_at": snapshot["meta"]["generated_at"], "stats": snapshot["stats"]})
    except Exception as exc:
        return _error(f"Snapshot failed: {exc}", 500)


urlpatterns = [
    path("knowledge/refresh", refresh),
    path("knowledge/me", mine),
    path("knowledge/me/context", context),
    path("knowledge/admin/refresh/<str:user_id>", admin_refresh),
]
