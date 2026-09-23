import shutil
import subprocess

import psutil
from django.http import JsonResponse
from django.urls import path

from app.core.deps import get_current_user
from app.models.user import Role


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
        return {"gpu_available": True, "gpu_name": name, "gpu_percent": float(usage), "gpu_memory_used_gb": round(float(used) / 1024, 2), "gpu_memory_total_gb": round(float(total) / 1024, 2)}
    except Exception:
        return {"gpu_available": False}


async def stats(request):
    if request.method != "GET":
        return JsonResponse({"detail": "Method not allowed"}, status=405)
    try:
        user = await get_current_user(request)
    except Exception as exc:
        return JsonResponse({"detail": getattr(exc, "detail", "Could not validate credentials")}, status=getattr(exc, "status_code", 401))
    if user.role != Role.ADMIN:
        return JsonResponse({"detail": "Not permitted for this role"}, status=403)
    memory = psutil.virtual_memory()
    return JsonResponse({
        "cpu_percent": psutil.cpu_percent(interval=0.3),
        "cpu_cores": psutil.cpu_count(logical=True) or 0,
        "memory_percent": memory.percent,
        "memory_used_gb": round(memory.used / (1024 ** 3), 2),
        "memory_total_gb": round(memory.total / (1024 ** 3), 2),
        **_gpu_stats(),
    })


urlpatterns = [path("system/stats", stats)]
