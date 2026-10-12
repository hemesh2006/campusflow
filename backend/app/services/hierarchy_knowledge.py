"""CampusFlow Institutional Hierarchy & Permissions Knowledge Service
======================================================================
Builds, synchronizes, and atomically persists a comprehensive hierarchical
representation of the entire campus ecosystem:

  backend/data/knowledge/campus_hierarchy.json

Purpose:
  Provides the multi-agent LLM system with complete, real-time contextual
  knowledge of:
    - Global system limits and runtime configurations.
    - Role-based access control (RBAC) permission vectors for each user.
    - The full collegiate chain-of-command:
        Admin -> Principal -> Department Heads (HODs) -> Class Advisors -> Students
    - Direct relationships (e.g. Which advisor mentors which student? Which HOD oversees which dept?).
    - Academic health metrics (Attendance rates, CGPA, task progress).

Deadlock & Concurrency Safety:
  - Uses `asyncio.Lock()` to serialize async write operations.
  - Implements atomic file writing: writes to a unique temporary file and
    uses `os.replace` to replace the target, avoiding race conditions,
    partial reads, and Windows file lock conflicts.
  - Non-blocking async file I/O executed in threadpool via `asyncio.to_thread`.
  - Coalesces rapid successive triggers via debounced scheduling.
"""
import os
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.database import users_col, tasks_col, settings_col
from app.models.user import Role

logger = logging.getLogger("campusflow.hierarchy")

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "knowledge"
HIERARCHY_FILE = KNOWLEDGE_DIR / "campus_hierarchy.json"

_lock = asyncio.Lock()
_pending_sync_task = None
_sync_delay = 0.5  # debounce time in seconds

ROLE_PERMISSIONS = {
    Role.ADMIN.value: {
        "level": 5,
        "title": "System Administrator",
        "scope": "platform_wide",
        "capabilities": [
            "manage_all_users",
            "modify_roles",
            "configure_system_limits",
            "inspect_cluster_nodes",
            "broadcast_any_channel",
            "delete_any_message",
            "manage_ai_models",
        ],
        "can_access_departments": ["*"],
        "chat_decision_powers": ["execute_administrative_tasks", "cluster_diagnostics", "user_provisioning"],
    },
    Role.PRINCIPAL.value: {
        "level": 4,
        "title": "Principal",
        "scope": "institution_wide",
        "capabilities": [
            "view_all_departments",
            "assign_hods",
            "assign_advisors",
            "inspect_any_class",
            "broadcast_principal_hod",
            "audit_academic_records",
        ],
        "can_access_departments": ["*"],
        "chat_decision_powers": ["strategic_directives", "inter_department_governance", "policy_announcements"],
    },
    Role.HOD.value: {
        "level": 3,
        "title": "Head of Department",
        "scope": "department_wide",
        "capabilities": [
            "oversee_dept_advisors",
            "view_dept_students",
            "broadcast_hod_advisor",
            "communicate_with_principal",
            "audit_dept_attendance",
        ],
        "can_access_departments": ["assigned_dept"],
        "chat_decision_powers": ["departmental_workflow_coordination", "attendance_reviews", "exam_clearance"],
    },
    Role.ADVISOR.value: {
        "level": 2,
        "title": "Class Advisor",
        "scope": "class_roster",
        "capabilities": [
            "manage_assigned_class_roster",
            "record_daily_attendance",
            "update_cgpa_and_academics",
            "issue_attendance_warnings",
            "broadcast_class_common_group",
            "communicate_with_hod",
            "direct_message_students",
        ],
        "can_access_departments": ["assigned_dept"],
        "chat_decision_powers": ["roll_call_governance", "student_academic_advising", "warning_escalation"],
    },
    Role.STUDENT.value: {
        "level": 1,
        "title": "Student",
        "scope": "personal_account",
        "capabilities": [
            "view_assigned_tasks",
            "track_attendance_and_cgpa",
            "apply_placement_drives",
            "participate_class_group",
            "direct_message_advisor",
            "update_personal_skills",
        ],
        "can_access_departments": ["assigned_dept"],
        "chat_decision_powers": ["personal_task_execution", "study_planning", "resume_optimization"],
    },
}


def _safe_str(v):
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v) if v is not None else None


async def build_hierarchy_tree() -> dict:
    """Queries MongoDB and compiles a comprehensive institutional knowledge snapshot."""
    # 1. Fetch system settings
    limits_doc = await settings_col.find_one({"_key": "agent_limits"}) or {}
    model_doc = await settings_col.find_one({"_id": "assistant"}) or {}

    platform_settings = {
        "agent_limits": {
            "max_agents": limits_doc.get("max_agents", 40),
            "per_user_limit": limits_doc.get("per_user_limit", 4),
            "per_hod_limit": limits_doc.get("per_hod_limit", 10),
        },
        "active_assistant_model": model_doc.get("model", "llama3.2"),
    }

    # 2. Fetch all users from MongoDB
    all_users = [u async for u in users_col.find({})]

    # Task aggregation for fast metrics
    pipeline = [
        {"$group": {
            "_id": "$owner_id",
            "total": {"$sum": 1},
            "done": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}}
        }}
    ]
    task_stats = {}
    try:
        async for r in tasks_col.aggregate(pipeline):
            task_stats[r["_id"]] = {"total": r.get("total", 0), "done": r.get("done", 0)}
    except Exception:
        pass

    # Classify by role
    admins = []
    principal = None
    hods_by_dept = {}
    advisors_by_id = {}
    students = []

    for u in all_users:
        uid = str(u["_id"])
        role = u.get("role", Role.STUDENT.value)
        dept = (u.get("dept") or "General").strip()

        user_info = {
            "id": uid,
            "name": u.get("name", "Unknown"),
            "email": u.get("email", ""),
            "role": role,
            "dept": dept,
            "permissions": ROLE_PERMISSIONS.get(role, {}),
        }

        if role == Role.ADMIN.value:
            admins.append(user_info)
        elif role == Role.PRINCIPAL.value:
            principal = user_info
        elif role == Role.HOD.value:
            hods_by_dept[dept.upper()] = user_info
        elif role == Role.ADVISOR.value:
            advisors_by_id[uid] = {
                **user_info,
                "students": [],
            }
        elif role == Role.STUDENT.value:
            t = task_stats.get(uid, {"total": 0, "done": 0})
            st_info = {
                **user_info,
                "roll_id": u.get("roll_id"),
                "class_advisor_id": u.get("class_advisor_id"),
                "cgpa": u.get("cgpa"),
                "attendance": u.get("attendance"),
                "placement_eligible": u.get("placement_eligible", True),
                "tasks": t,
                "shortage": (u.get("attendance") is not None and u.get("attendance") < 75.0),
            }
            students.append(st_info)

    # Nest students under their assigned advisors
    unassigned_students = []
    for st in students:
        adv_id = st.get("class_advisor_id")
        if adv_id and adv_id in advisors_by_id:
            advisors_by_id[adv_id]["students"].append(st)
        else:
            unassigned_students.append(st)

    # Group advisors by department
    advisors_by_dept = {}
    for adv in advisors_by_id.values():
        d = adv["dept"].upper()
        advisors_by_dept.setdefault(d, []).append(adv)

    # Collect unique departments
    all_depts = sorted(list(set(list(hods_by_dept.keys()) + list(advisors_by_dept.keys()))))
    if not all_depts:
        all_depts = ["CSE", "AIDS", "ECE"]

    departments_tree = {}
    for d in all_depts:
        departments_tree[d] = {
            "department_code": d,
            "hod": hods_by_dept.get(d),
            "class_advisors": advisors_by_dept.get(d, []),
        }

    # Fast user index for O(1) decision lookup
    user_lookup = {}
    for u in all_users:
        uid = str(u["_id"])
        role = u.get("role", Role.STUDENT.value)
        adv_id = u.get("class_advisor_id")
        adv = advisors_by_id.get(adv_id) if adv_id else None

        user_lookup[uid] = {
            "name": u.get("name"),
            "email": u.get("email"),
            "role": role,
            "dept": u.get("dept"),
            "level": ROLE_PERMISSIONS.get(role, {}).get("level", 1),
            "advisor": {"id": adv["id"], "name": adv["name"]} if adv else None,
            "can_modify_student": (role in (Role.ADMIN.value, Role.PRINCIPAL.value, Role.ADVISOR.value)),
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "meta": {
            "version": "1.0",
            "schema": "campusflow.institutional.hierarchy",
            "last_updated": now_iso,
            "total_users": len(all_users),
            "total_students": len(students),
            "active_departments": all_depts,
        },
        "platform_settings": platform_settings,
        "role_permissions": ROLE_PERMISSIONS,
        "hierarchy": {
            "institution_name": "CampusFlow Collegiate System",
            "administration": {
                "admins": admins,
                "principal": principal,
            },
            "departments": departments_tree,
            "unassigned_students": unassigned_students,
        },
        "user_index": user_lookup,
    }


async def _atomic_write_file(target_path: Path, data: dict):
    """
    Atomically writes a JSON document to disk without blocking or deadlocks:
    1. Writes to a temporary file in the same directory.
    2. Atomically replaces target file using os.replace.
    """
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    temp_filename = target_path.parent / f"{target_path.name}.tmp.{uuid.uuid4().hex}"
    json_bytes = json.dumps(data, indent=2, ensure_ascii=False, default=str).encode("utf-8")

    def _write_and_replace():
        with open(temp_filename, "wb") as f:
            f.write(json_bytes)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_filename, target_path)

    try:
        await asyncio.to_thread(_write_and_replace)
    except Exception as exc:
        if temp_filename.exists():
            try:
                temp_filename.unlink()
            except Exception:
                pass
        raise exc


async def sync_hierarchy_now() -> dict:
    """
    Direct asynchronous synchronization with lock protection.
    Returns the generated tree dict.
    """
    async with _lock:
        tree = await build_hierarchy_tree()
        await _atomic_write_file(HIERARCHY_FILE, tree)
        logger.info(f"Campus hierarchy snapshot saved atomically: {HIERARCHY_FILE}")
        return tree


def load_hierarchy() -> dict:
    """
    Safely reads the hierarchy JSON from disk. Returns empty dict if not yet generated.
    Thread-safe and non-blocking for read-heavy operations.
    """
    if not HIERARCHY_FILE.exists():
        return {}
    try:
        with open(HIERARCHY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.warning(f"Could not read hierarchy file: {exc}")
        return {}


def hierarchy_context_for_agent(user_id: str = None) -> str:
    """
    Produces a compact, LLM-ready context string summarizing the campus hierarchy,
    system settings, and permissions. Tailors context to user_id if provided.
    """
    data = load_hierarchy()
    if not data:
        return ""

    user_meta = data.get("user_index", {}).get(user_id, {}) if user_id else {}
    summary = {
        "institution": data.get("hierarchy", {}).get("institution_name", "CampusFlow"),
        "platform_limits": data.get("platform_settings", {}).get("agent_limits", {}),
        "user_role_context": user_meta,
        "departments": list(data.get("hierarchy", {}).get("departments", {}).keys()),
        "role_permissions": data.get("role_permissions", {}),
    }
    return json.dumps(summary, ensure_ascii=False, default=str)


def trigger_hierarchy_sync():
    """
    Debounced non-blocking trigger designed to be called fire-and-forget
    from anywhere in the backend on data changes.
    """
    global _pending_sync_task

    async def _debounced_worker():
        await asyncio.sleep(_sync_delay)
        try:
            await sync_hierarchy_now()
        except Exception as err:
            logger.error(f"Error in background hierarchy sync: {err}", exc_info=True)

    try:
        loop = asyncio.get_running_loop()
        if _pending_sync_task and not _pending_sync_task.done():
            _pending_sync_task.cancel()
        _pending_sync_task = loop.create_task(_debounced_worker())
    except RuntimeError:
        pass
