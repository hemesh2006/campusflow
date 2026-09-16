"""Real host system metrics for the Admin → Agent manager "Workload"
gauges. CPU/RAM via psutil (cross-platform). GPU via `nvidia-smi` when
present — this box may not have an NVIDIA GPU or the driver tools
installed, so GPU fields degrade gracefully to gpu_available=False
instead of faking a number."""
import shutil
import subprocess
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends
import psutil

from app.core.deps import require_role
from app.models.user import UserPublic, Role

router = APIRouter(prefix="/system", tags=["system"])


class SystemStats(BaseModel):
    cpu_percent: float
    cpu_cores: int
    memory_percent: float
    memory_used_gb: float
    memory_total_gb: float
    gpu_available: bool
    gpu_name: Optional[str] = None
    gpu_percent: Optional[float] = None
    gpu_memory_used_gb: Optional[float] = None
    gpu_memory_total_gb: Optional[float] = None


def _read_gpu_stats() -> dict:
    """Shell out to nvidia-smi if it's on PATH. Any failure (no GPU, no
    driver, AMD/Intel-only box, sandboxed env) just means "no GPU" —
    never raises, never fabricates a number."""
    exe = shutil.which("nvidia-smi")
    if not exe:
        return {"gpu_available": False}
    try:
        out = subprocess.run(
            [exe, "--query-gpu=name,utilization.gpu,memory.used,memory.total",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return {"gpu_available": False}
        # First GPU only — plenty for a workload gauge.
        name, util, mem_used, mem_total = [p.strip() for p in out.stdout.strip().splitlines()[0].split(",")]
        return {
            "gpu_available": True,
            "gpu_name": name,
            "gpu_percent": float(util),
            "gpu_memory_used_gb": round(float(mem_used) / 1024, 2),
            "gpu_memory_total_gb": round(float(mem_total) / 1024, 2),
        }
    except Exception:
        return {"gpu_available": False}


@router.get("/stats", response_model=SystemStats)
async def system_stats(
    current_user: UserPublic = Depends(require_role(Role.ADMIN)),
):
    cpu_percent = psutil.cpu_percent(interval=0.3)
    mem = psutil.virtual_memory()
    gpu = _read_gpu_stats()

    return SystemStats(
        cpu_percent=cpu_percent,
        cpu_cores=psutil.cpu_count(logical=True) or 0,
        memory_percent=mem.percent,
        memory_used_gb=round(mem.used / (1024 ** 3), 2),
        memory_total_gb=round(mem.total / (1024 ** 3), 2),
        **gpu,
    )
