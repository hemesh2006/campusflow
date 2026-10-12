"""Hierarchy & Permissions Synchronization Service
==================================================
Maintains a real-time, hierarchically-organized JSON file:
    backend/data/user_hierarchy.json

This file captures:
  - Every user's full profile information
  - User preferences and settings
  - Dynamic Role-Based Access Control (RBAC) permissions & scope
  - Institutional hierarchy relationships (Principals -> HODs -> Class Advisors -> Students)
  - Subordinate and reporting lines for each individual

AI Assistant & Agent Grounding:
-------------------------------
The LLM chat assistant and multi-agent workers read this file to make
grounded decisions, strictly respecting the user's authority scope,
relationships, and permissions.

Concurrency & Deadlock Prevention:
----------------------------------
1. Async Lock with Timeout: Operations acquire the lock with a strict
   timeout (preventing indefinite hangs).
2. Debounced/Coalesced Background Execution: When multiple backend endpoints
   trigger updates simultaneously, updates coalesce safely into a single
   follow-up rebuild rather than piling up concurrent file operations.
3. Windows-Safe Atomic Replacement: Writes to a unique temp file, flushes/fsyncs,
   and replaces the file with exponential-backoff retries against Windows WinError 32
   file locks.
4. Non-blocking In-Memory Cache: Reads can instantly fall back to memory without
   blocking during I/O.
"""

import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from bson import ObjectId

from app.database import attendance_col, tasks_col, users_col

logger = logging.getLogger("campusflow.hierarchy_sync")

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
HIERARCHY_FILE_PATH = DATA_DIR / "user_hierarchy.json"

# Async lock for serializing file rebuilds
_lock = asyncio.Lock()

# State for coalescing concurrent background sync requests
_sync_in_progress = False
_sync_pending = False

# Memory cache for fast, zero-wait access by AI and API readers
_memory_cache: Optional[dict] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def compute_user_permissions(role: str, user_doc: Optional[dict] = None) -> dict:
    """Compute granular RBAC capability matrix and scope for a given role and user."""
    role_str = (role or "student").lower()
    dept = (user_doc or {}).get("dept")

    levels = {
        "admin": 5,
        "principal": 4,
        "hod": 3,
        "advisor": 2,
        "student": 1,
    }
    level = levels.get(role_str, 1)

    scopes = {
        "admin": "system",
        "principal": "institution",
        "hod": f"department:{dept}" if dept else "department",
        "advisor": f"class:{dept}" if dept else "class",
        "student": "self",
    }
    scope = scopes.get(role_str, "self")

    is_admin = role_str == "admin"
    is_principal = role_str == "principal"
    is_hod = role_str == "hod"
    is_advisor = role_str == "advisor"
    is_student = role_str == "student"

    return {
        "role": role_str,
        "role_level": level,
        "scope": scope,
        # Administrative & Governance
        "can_view_institution_stats": is_admin or is_principal,
        "can_manage_roles": is_admin or is_principal or is_hod,
        "can_manage_departments": is_admin or is_principal,
        "can_view_all_departments": is_admin or is_principal,
        # Academic & Student Management
        "can_manage_advisors": is_admin or is_principal or is_hod,
        "can_manage_students": is_admin or is_principal or is_hod or is_advisor,
        "can_view_all_students": is_admin or is_principal or is_hod,
        "can_mark_attendance": is_admin or is_advisor,
        "can_warn_attendance": is_admin or is_principal or is_hod or is_advisor,
        "can_edit_academic_records": is_admin or is_principal or is_hod or is_advisor,
        # Communication & Broadcasting
        "can_broadcast_institution": is_admin or is_principal,
        "can_broadcast_department": is_admin or is_principal or is_hod,
        "can_broadcast_class": is_admin or is_principal or is_hod or is_advisor,
        # Tasks & Agents
        "can_manage_own_tasks": True,
        "can_assign_tasks_to_others": not is_student,
        "can_manage_agents": is_admin,
        "can_access_llm_admin": is_admin,
        "can_view_hardware_telemetry": is_admin,
    }

    # If the user has custom explicit permission overrides stored, preserve them
    if user_doc and isinstance(user_doc.get("permissions"), dict):
        perms.update(user_doc["permissions"])

    return perms


def get_default_settings(role: str) -> dict:
    """Default user preferences, notification toggles, and assistant configuration."""
    role_str = (role or "student").lower()
    return {
        "theme": "system",
        "notifications": {
            "email": True,
            "telegram": False,
            "academic_alerts": True,
            "announcements": True,
            "attendance_warnings": True,
        },
        "ai_assistant": {
            "enabled": True,
            "preferred_model": None,
            "response_style": "academic" if role_str in ("student", "advisor") else "executive",
            "auto_context": True,
            "permission_aware": True,
        },
        "privacy": {
            "profile_visible": True,
            "show_contact": role_str != "student",
        },
    }


def _merge_settings(existing: Optional[dict], role: str) -> dict:
    defaults = get_default_settings(role)
    if not existing or not isinstance(existing, dict):
        return defaults

    result = dict(defaults)
    for k, v in existing.items():
        if isinstance(v, dict) and isinstance(result.get(k), dict):
            merged_sub = dict(result[k])
            merged_sub.update(v)
            result[k] = merged_sub
        else:
            result[k] = v
    return result


async def build_hierarchy_data() -> dict:
    """Query MongoDB and compile the complete hierarchical state of the institution."""
    users_raw = [u async for u in users_col.find({})]

    # Pre-fetch task counts by owner
    task_map: dict[str, dict[str, int]] = {}
    try:
        pipeline = [
            {"$group": {
                "_id": "$owner_id",
                "total": {"$sum": 1},
                "done": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}},
            }}
        ]
        async for row in tasks_col.aggregate(pipeline):
            task_map[str(row["_id"])] = {
                "total": row.get("total", 0),
                "done": row.get("done", 0),
            }
    except Exception as exc:
        logger.warning("Could not aggregate tasks for hierarchy: %s", exc)

    # Index users by ID and build basic objects
    user_nodes: dict[str, dict] = {}
    for u in users_raw:
        uid = str(u["_id"])
        role = u.get("role", "student")
        settings = _merge_settings(u.get("settings"), role)
        permissions = compute_user_permissions(role, u)
        t_stats = task_map.get(uid, {"total": 0, "done": 0})

        profile = {
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "role": role,
            "dept": u.get("dept"),
            "class_advisor_id": u.get("class_advisor_id"),
            "roll_id": u.get("roll_id"),
            "mobile": u.get("mobile"),
            "dob": u.get("dob"),
            "year": u.get("year"),
            "college": u.get("college"),
            "cgpa": u.get("cgpa"),
            "attendance": u.get("attendance"),
            "semesters": u.get("semesters", []),
            "resume_uploaded": u.get("resume_uploaded", False),
            "telegram_linked": u.get("telegram_linked", False),
            "placement_eligible": u.get("placement_eligible", True),
        }

        user_nodes[uid] = {
            "id": uid,
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "role": role,
            "dept": u.get("dept"),
            "profile": profile,
            "settings": settings,
            "permissions": permissions,
            "hierarchy": {
                "level": permissions["role_level"],
                "scope": permissions["scope"],
                "department": u.get("dept"),
                "reports_to": None,
                "manages": [],
            },
            "stats": {
                "cgpa": u.get("cgpa"),
                "attendance": u.get("attendance"),
                "tasks_total": t_stats["total"],
                "tasks_done": t_stats["done"],
            },
        }

    # Group users by role and department
    admins: list[dict] = []
    principals: list[dict] = []
    hods_by_dept: dict[str, dict] = {}
    advisors_by_dept: dict[str, list[dict]] = {}
    students_by_advisor: dict[str, list[dict]] = {}
    students_unassigned_by_dept: dict[str, list[dict]] = {}
    unassigned_general: list[dict] = []

    for uid, node in user_nodes.items():
        role = node["role"]
        dept = node["dept"] or "General"
        advisor_id = node["profile"].get("class_advisor_id")

        if role == "admin":
            admins.append(node)
        elif role == "principal":
            principals.append(node)
        elif role == "hod":
            hods_by_dept[dept] = node
        elif role == "advisor":
            advisors_by_dept.setdefault(dept, []).append(node)
        elif role == "student":
            if advisor_id and advisor_id in user_nodes:
                students_by_advisor.setdefault(advisor_id, []).append(node)
            elif node["dept"]:
                students_unassigned_by_dept.setdefault(dept, []).append(node)
            else:
                unassigned_general.append(node)
        else:
            unassigned_general.append(node)

    # Establish hierarchical reporting lines & subordinate relationships
    principal_ref = (
        {"id": principals[0]["id"], "name": principals[0]["name"], "role": "principal"}
        if principals
        else None
    )

    # Connect HODs
    for dept, hod in hods_by_dept.items():
        hod["hierarchy"]["reports_to"] = principal_ref
        dept_advisors = advisors_by_dept.get(dept, [])
        hod["hierarchy"]["manages"] = [
            {"id": a["id"], "name": a["name"], "role": "advisor"}
            for a in dept_advisors
        ]

    # Connect Advisors
    for dept, adv_list in advisors_by_dept.items():
        dept_hod = hods_by_dept.get(dept)
        hod_ref = (
            {"id": dept_hod["id"], "name": dept_hod["name"], "role": "hod", "dept": dept}
            if dept_hod
            else principal_ref
        )
        for adv in adv_list:
            adv["hierarchy"]["reports_to"] = hod_ref
            c_students = students_by_advisor.get(adv["id"], [])
            adv["hierarchy"]["manages"] = [
                {"id": s["id"], "name": s["name"], "role": "student", "roll_id": s["profile"].get("roll_id")}
                for s in c_students
            ]

    # Connect Students
    for uid, node in user_nodes.items():
        if node["role"] == "student":
            adv_id = node["profile"].get("class_advisor_id")
            if adv_id and adv_id in user_nodes:
                adv = user_nodes[adv_id]
                node["hierarchy"]["reports_to"] = {
                    "id": adv["id"],
                    "name": adv["name"],
                    "role": "advisor",
                    "dept": adv["dept"],
                }
            elif node["dept"] and node["dept"] in hods_by_dept:
                dept_hod = hods_by_dept[node["dept"]]
                node["hierarchy"]["reports_to"] = {
                    "id": dept_hod["id"],
                    "name": dept_hod["name"],
                    "role": "hod",
                    "dept": node["dept"],
                }
            else:
                node["hierarchy"]["reports_to"] = principal_ref

    # Assemble Department Trees
    all_depts = set(hods_by_dept.keys()) | set(advisors_by_dept.keys()) | set(students_unassigned_by_dept.keys())
    all_depts.discard("General")

    departments_tree: dict[str, dict] = {}
    for d in sorted(all_depts):
        dept_hod = hods_by_dept.get(d)
        adv_nodes = []
        for adv in advisors_by_dept.get(d, []):
            st_list = students_by_advisor.get(adv["id"], [])
            adv_nodes.append({
                "id": adv["id"],
                "name": adv["name"],
                "email": adv["email"],
                "settings": adv["settings"],
                "permissions": adv["permissions"],
                "class_students_count": len(st_list),
                "students": [
                    {
                        "id": s["id"],
                        "name": s["name"],
                        "email": s["email"],
                        "roll_id": s["profile"].get("roll_id"),
                        "cgpa": s["profile"].get("cgpa"),
                        "attendance": s["profile"].get("attendance"),
                        "settings": s["settings"],
                        "permissions": s["permissions"],
                    }
                    for s in st_list
                ],
            })

        unassigned_st = [
            {
                "id": s["id"],
                "name": s["name"],
                "email": s["email"],
                "roll_id": s["profile"].get("roll_id"),
                "settings": s["settings"],
                "permissions": s["permissions"],
            }
            for s in students_unassigned_by_dept.get(d, [])
        ]

        departments_tree[d] = {
            "department": d,
            "hod": (
                {
                    "id": dept_hod["id"],
                    "name": dept_hod["name"],
                    "email": dept_hod["email"],
                    "settings": dept_hod["settings"],
                    "permissions": dept_hod["permissions"],
                }
                if dept_hod
                else None
            ),
            "advisors": adv_nodes,
            "unassigned_students": unassigned_st,
            "total_students": sum(a["class_students_count"] for a in adv_nodes) + len(unassigned_st),
        }

    # Summary Statistics
    role_counts = {
        "admin": len(admins),
        "principal": len(principals),
        "hod": len(hods_by_dept),
        "advisor": sum(len(v) for v in advisors_by_dept.values()),
        "student": sum(1 for n in user_nodes.values() if n["role"] == "student"),
    }

    hierarchy_payload = {
        "metadata": {
            "generated_at": _now(),
            "institution": "CampusFlow Academic System",
            "schema_version": "2.0",
            "total_users": len(user_nodes),
            "departments_count": len(departments_tree),
            "role_distribution": role_counts,
        },
        "hierarchy_tree": {
            "system_administrators": [
                {"id": a["id"], "name": a["name"], "email": a["email"], "settings": a["settings"], "permissions": a["permissions"]}
                for a in admins
            ],
            "principals": [
                {"id": p["id"], "name": p["name"], "email": p["email"], "settings": p["settings"], "permissions": p["permissions"]}
                for p in principals
            ],
            "departments": departments_tree,
            "unassigned_users": [
                {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"], "settings": u["settings"]}
                for u in unassigned_general
            ],
        },
        "users": user_nodes,
        "permissions_reference": {
            "levels": {
                5: "admin (System Level)",
                4: "principal (Institution Level)",
                3: "hod (Department Level)",
                2: "advisor (Class Level)",
                1: "student (Self Level)",
            }
        },
    }

    return hierarchy_payload


def _write_file_atomic(data: dict) -> None:
    """Safely write data to HIERARCHY_FILE_PATH using atomic temp file replace with retry."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = DATA_DIR / f"user_hierarchy.json.tmp.{uuid.uuid4().hex}"
    json_bytes = json.dumps(data, indent=2, ensure_ascii=False, default=str).encode("utf-8")

    try:
        with open(temp_path, "wb") as f:
            f.write(json_bytes)
            f.flush()
            os.fsync(f.fileno())

        # Atomic rename with exponential backoff for Windows WinError 32
        max_attempts = 6
        for attempt in range(max_attempts):
            try:
                os.replace(temp_path, HIERARCHY_FILE_PATH)
                break
            except (PermissionError, OSError) as exc:
                if attempt == max_attempts - 1:
                    logger.error("Failed to replace %s after %d retries: %s", HIERARCHY_FILE_PATH, max_attempts, exc)
                    raise
                time.sleep(0.02 * (2**attempt))
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


async def _sync_hierarchy_impl() -> dict:
    """Internal implementation that compiles and writes the hierarchy state."""
    global _memory_cache
    data = await build_hierarchy_data()
    await asyncio.to_thread(_write_file_atomic, data)
    _memory_cache = data
    return data


async def _coalesced_sync_worker() -> None:
    """Background worker that executes sync and coalesces overlapping calls."""
    global _sync_in_progress, _sync_pending
    _sync_in_progress = True
    try:
        while True:
            _sync_pending = False
            try:
                # 8-second timeout on lock acquisition to strictly guarantee deadlock immunity
                async with asyncio.timeout(8.0):
                    async with _lock:
                        await _sync_hierarchy_impl()
            except asyncio.TimeoutError:
                logger.error("[HierarchySync] Timed out waiting for hierarchy lock — prevented deadlock.")
            except Exception as exc:
                logger.exception("[HierarchySync] Error rebuilding user_hierarchy.json: %s", exc)

            if not _sync_pending:
                break
    finally:
        _sync_in_progress = False


def trigger_hierarchy_sync() -> None:
    """Fire-and-forget sync trigger.

    Call this after any mutation (user update, role assignment, settings change,
    advisor mapping, academic update, attendance save, task create/update).
    Safe to call concurrently without blocking request handlers or deadlocking.
    """
    global _sync_in_progress, _sync_pending
    if _sync_in_progress:
        _sync_pending = True
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_coalesced_sync_worker())
    except RuntimeError:
        # No running event loop (e.g. called from synchronous script)
        pass


async def sync_hierarchy_now(timeout: float = 8.0) -> dict:
    """Explicitly await full sync and return freshest hierarchy data.

    Protected with timeout against deadlocks.
    """
    global _memory_cache
    try:
        async with asyncio.timeout(timeout):
            async with _lock:
                return await _sync_hierarchy_impl()
    except asyncio.TimeoutError:
        logger.error("[HierarchySync] sync_hierarchy_now timed out; returning cached data.")
        return read_hierarchy_cached()
    except Exception as exc:
        logger.exception("[HierarchySync] sync_hierarchy_now failed: %s", exc)
        return read_hierarchy_cached()


def read_hierarchy_cached() -> dict:
    """Read the latest hierarchy data from in-memory cache or disk with zero-lock fallback."""
    global _memory_cache
    if _memory_cache:
        return _memory_cache

    if not HIERARCHY_FILE_PATH.exists():
        return {}

    for attempt in range(4):
        try:
            content = HIERARCHY_FILE_PATH.read_text(encoding="utf-8")
            if content.strip():
                _memory_cache = json.loads(content)
                return _memory_cache
        except (PermissionError, OSError):
            time.sleep(0.02 * (2**attempt))
        except json.JSONDecodeError:
            break

    return _memory_cache or {}


def get_user_hierarchy_node(user_id: str) -> Optional[dict]:
    """Retrieve full user node (profile, settings, permissions, hierarchy) by user_id."""
    data = read_hierarchy_cached()
    users = data.get("users", {})
    return users.get(str(user_id))
