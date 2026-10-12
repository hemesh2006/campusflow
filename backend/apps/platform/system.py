"""System endpoints for admin-only platform controls.

/system/stats  — live CPU / GPU / RAM metrics (psutil + nvidia-smi)
/system/nodes  — live agent node counts from MongoDB
/system/settings — GET returns current global limits; PATCH updates them
                   (persisted in MongoDB settings_col under key "agent_limits")
"""
import asyncio
import shutil
import subprocess

import psutil
from django.http import JsonResponse
from django.urls import path

from app.core.deps import get_current_user
from app.models.user import Role
from app.database import agents_col, settings_col

SETTINGS_KEY = "agent_limits"
DEFAULT_SETTINGS = {
    "max_agents": 40,
    "per_user_limit": 4,
    "per_hod_limit": 10,
}


def _gpu_stats():
    executable = shutil.which("nvidia-smi")
    if not executable:
        return {"gpu_available": False}
    try:
        result = subprocess.run(
            [executable, "--query-gpu=name,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2,
        )
        name, usage, used, total = [part.strip() for part in result.stdout.strip().splitlines()[0].split(",")]
        return {
            "gpu_available": True, "gpu_name": name,
            "gpu_percent": float(usage),
            "gpu_memory_used_gb": round(float(used) / 1024, 2),
            "gpu_memory_total_gb": round(float(total) / 1024, 2),
        }
    except Exception:
        return {"gpu_available": False}


async def _require_admin(request):
    try:
        user = await get_current_user(request)
    except Exception as exc:
        return None, JsonResponse(
            {"detail": getattr(exc, "detail", "Could not validate credentials")},
            status=getattr(exc, "status_code", 401),
        )
    if user.role != Role.ADMIN:
        return None, JsonResponse({"detail": "Not permitted for this role"}, status=403)
    return user, None


async def _load_settings() -> dict:
    doc = await settings_col.find_one({"_key": SETTINGS_KEY})
    if doc:
        return {k: doc.get(k, DEFAULT_SETTINGS[k]) for k in DEFAULT_SETTINGS}
    return dict(DEFAULT_SETTINGS)


# ─── /system/stats ──────────────────────────────────────────────────────────
async def stats(request):
    if request.method != "GET":
        return JsonResponse({"detail": "Method not allowed"}, status=405)
    _, err = await _require_admin(request)
    if err:
        return err
    memory = psutil.virtual_memory()
    gpu = await asyncio.to_thread(_gpu_stats)
    return JsonResponse({
        "cpu_percent": psutil.cpu_percent(interval=0.3),
        "cpu_cores": psutil.cpu_count(logical=True) or 0,
        "memory_percent": memory.percent,
        "memory_used_gb": round(memory.used / (1024 ** 3), 2),
        "memory_total_gb": round(memory.total / (1024 ** 3), 2),
        **gpu,
    })


# ─── /system/nodes ──────────────────────────────────────────────────────────
async def nodes(request):
    """Return live counts of running / idle / total agent nodes from MongoDB."""
    if request.method != "GET":
        return JsonResponse({"detail": "Method not allowed"}, status=405)
    _, err = await _require_admin(request)
    if err:
        return err
    total, running, idle = await asyncio.gather(
        agents_col.count_documents({}),
        agents_col.count_documents({"status": "running"}),
        agents_col.count_documents({"status": "idle"}),
    )
    limits = await _load_settings()
    # Agents that are running as a fraction of the configured cap
    capacity_used = round(running / limits["max_agents"] * 100, 1) if limits["max_agents"] else 0
    return JsonResponse({
        "total": total,
        "running": running,
        "idle": idle,
        "stopped": total - running - idle,
        "capacity_used_pct": capacity_used,
        "max_agents": limits["max_agents"],
        "per_user_limit": limits["per_user_limit"],
        "per_hod_limit": limits["per_hod_limit"],
    })


# ─── /system/settings ───────────────────────────────────────────────────────
async def system_settings(request):
    """
    GET  — return current global limits (max_agents, per_user_limit, per_hod_limit)
    PATCH — update one or more limit values (admin only)
    """
    _, err = await _require_admin(request)
    if err:
        return err

    if request.method == "GET":
        current = await _load_settings()
        return JsonResponse(current)

    if request.method != "PATCH":
        return JsonResponse({"detail": "Method not allowed"}, status=405)

    try:
        import json
        body = json.loads(request.body or b"{}")
    except Exception:
        return JsonResponse({"detail": "Invalid JSON body"}, status=400)

    updates = {}
    for key in DEFAULT_SETTINGS:
        if key in body:
            val = body[key]
            if not isinstance(val, (int, float)) or val < 0:
                return JsonResponse({"detail": f"Invalid value for {key}"}, status=422)
            updates[key] = int(val)

    if not updates:
        return JsonResponse({"detail": "No valid fields to update"}, status=422)

    await settings_col.update_one(
        {"_key": SETTINGS_KEY},
        {"$set": updates},
        upsert=True,
    )
    current = await _load_settings()
    return JsonResponse(current)


urlpatterns = [
    path("system/stats", stats),
    path("system/nodes", nodes),
    path("system/settings", system_settings),
]
