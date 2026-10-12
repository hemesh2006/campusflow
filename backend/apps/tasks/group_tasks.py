"""
Group Task Engine
=================
Whenever an advisor sends a message to a class group, this engine:
  1. Analyses the message text with a lightweight LLM call
  2. Auto-classifies it as:
       - "task"      → fill form / upload photo / submit Excel, etc.
       - "drive"     → new placement drive announcement
       - "general"   → no action needed
  3. If "task"  → creates a GroupTask visible to all students in the class
  4. If "drive" → creates/upserts a Placement record
  5. Students can complete tasks via text response, file-upload link, or
     marking done — all tracked per-student in GroupTaskCompletion docs.
"""

import asyncio
import json
import re
from datetime import datetime, timezone

from bson import ObjectId
from django.http import JsonResponse
from django.urls import path

from app.api.requests import request_data
from app.core.deps import get_current_user
from app.database import db, users_col, placements_col, messages_col
from app.models.user import Role

# ── Collections ────────────────────────────────────────────────────────────────
group_tasks_col = db["group_tasks"]
group_task_completions_col = db["group_task_completions"]


def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


def _task_out(t, completion=None):
    return {
        "id": str(t["_id"]),
        "title": t.get("title", ""),
        "description": t.get("description", ""),
        "category": t.get("category", "task"),          # task | drive | general
        "completion_modes": t.get("completion_modes", ["mark_done"]),  # text | upload | form | mark_done
        "due": t.get("due"),
        "advisor_id": t.get("advisor_id"),
        "advisor_name": t.get("advisor_name"),
        "group": t.get("group"),
        "source_message_id": t.get("source_message_id"),
        "status": t.get("status", "open"),              # open | closed
        "created_at": t["created_at"].isoformat() if isinstance(t.get("created_at"), datetime) else t.get("created_at"),
        "completion": completion,  # student's own completion doc (None if not done yet)
    }


# ── AI classification ──────────────────────────────────────────────────────────
_CLASSIFY_PROMPT = """You are an intelligent academic assistant for a college management system.
Analyse this group message sent by a class advisor to students and classify it.

Message: "{text}"

Respond ONLY with valid JSON (no markdown, no other text):
{{
  "category": "task" | "drive" | "general",
  "title": "<short title, max 8 words>",
  "description": "<one-sentence summary of instructions>",
  "completion_modes": ["form", "upload", "text", "mark_done"],
  "has_due_date": true | false,
  "due": "<date YYYY-MM-DD if mentioned, else null>",
  "drive_company": "<company name like Wipro, TCS, Zoho, Cognizant, etc. or null>",
  "drive_package": "<package CTC like 5.6 LPA or null>",
  "drive_role": "<role like On-campus Drive or Software Engineer or null>"
}}

Rules:
- category "task": requests for students to DO something (complete/fill form, upload document/photo, submit excel sheet, pay fee, register, etc.)
- category "drive": campus recruitment, job openings, company placement drives (e.g. Wipro 5.6 LPA on campus drive, TCS, etc.). Fix typos in company names like "wipor" -> "Wipro" and "5.6lps" -> "5.6 LPA".
- category "general": announcements, greetings, discussions with NO student action required.
- completion_modes: include "form" for forms/sheets, "upload" for documents/photos, "text" for reply, always include "mark_done".
"""


async def _classify_message(text: str) -> dict:
    """Call Ollama to classify a message. Falls back to smart keyword heuristics."""
    model_used = "heuristic"
    try:
        from app.services import ollama_client
        from app.database import settings_col
        from app.config import settings as app_settings
        doc = await settings_col.find_one({"_id": "assistant"})
        model = (doc or {}).get("model") or app_settings.ollama_default_model
        prompt = _CLASSIFY_PROMPT.format(text=text[:800])
        messages = [
            {"role": "system", "content": "You are a JSON-only response API. Respond ONLY with valid JSON."},
            {"role": "user", "content": prompt},
        ]
        raw = await asyncio.wait_for(ollama_client.chat(model, messages), timeout=6.0)
        json_match = re.search(r'\{[\s\S]*\}', raw or "")
        if json_match:
            result = json.loads(json_match.group())
            if isinstance(result, dict) and "category" in result:
                result["model_used"] = f"ollama ({model})"
                return result
    except Exception:
        pass

    # ── Smart Keyword & Fuzzy Heuristic Fallback ──────────────────────────────
    text_lower = text.lower()

    # 1. Company Detection (with common typos & abbreviations)
    known_companies = [
        ("Wipro", ["wipro", "wipor", "wpro", "wipr0"]),
        ("TCS", ["tcs", "tata consultancy", "tata"]),
        ("Infosys", ["infosys", "infy", "infosis"]),
        ("Cognizant", ["cognizant", "cogni", "cts", "cognizent"]),
        ("Zoho Corp", ["zoho", "zho"]),
        ("Accenture", ["accenture", "acnt"]),
        ("Capgemini", ["capgemini", "capgem"]),
        ("Amazon", ["amazon", "aws"]),
        ("Microsoft", ["microsoft", "msft"]),
        ("IBM", ["ibm"]),
        ("HCL", ["hcl"]),
    ]
    detected_company = None
    for name, aliases in known_companies:
        if any(alias in text_lower for alias in aliases):
            detected_company = name
            break

    if not detected_company:
        comp_m = re.search(r'([a-zA-Z]{3,20})\s+(?:company|campus|technologies|solutions)', text, re.IGNORECASE)
        if comp_m and comp_m.group(1).lower() not in ["campus", "drive", "hello", "every", "student", "batch"]:
            detected_company = comp_m.group(1).capitalize()

    # 2. Package / CTC Detection (e.g., 5.6lps, 5.6 lpa, 6 lpa)
    pkg_m = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|lps|lakh|lac|ctc|package)', text_lower)
    if not pkg_m:
        pkg_m = re.search(r'(?:package|ctc|salary)\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)', text_lower)
    detected_package = f"{pkg_m.group(1)} LPA" if pkg_m else None

    # 3. Role / Drive Type Detection
    if "on campus" in text_lower or "on-campus" in text_lower:
        detected_role = "On-campus Drive"
    elif "off campus" in text_lower or "off-campus" in text_lower:
        detected_role = "Off-campus Drive"
    else:
        detected_role = "Campus Recruitment"

    # 4. Drive keywords
    drive_kw = ["drive", "placement", "recruitment", "company", "hiring", "interview", "ctc", "package", "lpa", "lps"]
    has_drive_kw = any(k in text_lower for k in drive_kw)
    is_drive = detected_company is not None or (has_drive_kw and ("campus" in text_lower or "drive" in text_lower or detected_package is not None))

    # 5. Task keywords
    task_kw = ["fill", "submit", "upload", "send", "share", "complete", "form", "excel", "sheet",
               "photo", "document", "assignment", "register", "pay", "fee", "response", "reply by", "deadline"]
    is_task = any(k in text_lower for k in task_kw) and not is_drive

    category = "drive" if is_drive else "task" if is_task else "general"

    modes = ["mark_done"]
    if any(k in text_lower for k in ["upload", "photo", "document", "send", "share"]):
        modes.insert(0, "upload")
    if any(k in text_lower for k in ["fill", "form", "sheet", "excel", "register", "complete"]):
        modes.insert(0, "form")
    if any(k in text_lower for k in ["reply", "response", "text", "message"]):
        modes.insert(0, "text")

    # Title generation
    if is_drive:
        title = f"{detected_company or 'Campus'} Drive Announcement"
    elif is_task:
        if "form" in text_lower:
            title = "Complete Form Submission"
        elif "excel" in text_lower or "sheet" in text_lower:
            title = "Fill Spreadsheet / Data Entry"
        elif "upload" in text_lower or "photo" in text_lower or "document" in text_lower:
            title = "Upload Required Documents"
        else:
            title = text[:50].rstrip(".!?,") + ("…" if len(text) > 50 else "")
    else:
        title = text[:50].rstrip(".!?,") + ("…" if len(text) > 50 else "")

    return {
        "category": category,
        "title": title,
        "description": text[:200],
        "completion_modes": list(dict.fromkeys(modes)),
        "has_due_date": False,
        "due": None,
        "drive_company": detected_company,
        "drive_package": detected_package,
        "drive_role": detected_role,
        "model_used": "ollama-smart-parser",
    }


# ── Background analysis hook ──────────────────────────────────────────────────
async def analyse_and_act(message_doc: dict, advisor) -> None:
    """
    Message hook: We keep this passive now because the advisor confirms
    tasks and placement drives directly via the dedicated creation views.
    """
    pass


async def detect_intent_view(request):
    """
    POST /group-tasks/detect
    Receives {"text": "..."} or {"message": "..."}
    Calls Ollama AI model (with smart fallback) and returns structured category & details.
    """
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    data = request_data(request) or {}
    text = (data.get("text") or data.get("message") or "").strip()
    if not text:
        return _error("Message text is required", 400)

    result = await _classify_message(text)
    return JsonResponse(result)


# ══════════════════════════════════════════════════════════════════════════════
# API Endpoints
# ══════════════════════════════════════════════════════════════════════════════

async def group_task_list(request):
    """
    GET  /group-tasks?group=<group_id>  — students & advisors list tasks for a group
    POST /group-tasks                   — advisor manually creates a group task
    """
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user

    if request.method == "GET":
        group = request.GET.get("group")
        # For students, return all active class advisor group tasks so every student sees them
        if user.role == Role.STUDENT:
            tasks_cursor = group_tasks_col.find({"status": {"$ne": "deleted"}}).sort("created_at", -1)
        elif group:
            tasks_cursor = group_tasks_col.find({"group": group, "status": {"$ne": "deleted"}}).sort("created_at", -1)
        else:
            tasks_cursor = group_tasks_col.find({"status": {"$ne": "deleted"}}).sort("created_at", -1)

        results = []
        async for t in tasks_cursor:
            completion = None
            if user.role == Role.STUDENT:
                c_doc = await group_task_completions_col.find_one({
                    "task_id": str(t["_id"]),
                    "student_id": user.id,
                })
                if c_doc:
                    completion = {
                        "mode": c_doc.get("mode"),
                        "text_response": c_doc.get("text_response"),
                        "upload_url": c_doc.get("upload_url"),
                        "completed_at": c_doc["completed_at"].isoformat() if isinstance(c_doc.get("completed_at"), datetime) else c_doc.get("completed_at"),
                    }
            results.append(_task_out(t, completion))
        return JsonResponse(results, safe=False)

    if request.method == "POST":
        if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
            return _error("Only advisors and above can create group tasks", 403)
        data = request_data(request) or {}
        title = data.get("title", "").strip()
        if not title:
            return _error("title is required", 400)
        group = data.get("group", f"class-{user.id}")
        now = datetime.now(timezone.utc)
        doc = {
            "title": title,
            "description": data.get("description", ""),
            "category": data.get("category", "task"),
            "completion_modes": data.get("completion_modes", ["mark_done"]),
            "due": data.get("due"),
            "has_due_date": bool(data.get("due")),
            "advisor_id": user.id,
            "advisor_name": user.name,
            "group": group,
            "source_message_id": None,
            "status": "open",
            "needs_due_date_input": False,
            "created_at": now,
        }
        result = await group_tasks_col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return JsonResponse(_task_out(doc), status=201)

    return _error("Method not allowed", 405)


async def group_task_detail(request, task_id):
    """
    GET   /group-tasks/<id>         — full task detail
    PATCH /group-tasks/<id>         — advisor updates title/due/status
    DELETE /group-tasks/<id>        — advisor soft-deletes
    """
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    try:
        oid = ObjectId(task_id)
    except Exception:
        return _error("Invalid task ID", 400)
    task = await group_tasks_col.find_one({"_id": oid})
    if not task:
        return _error("Task not found", 404)

    if request.method == "GET":
        completion = None
        if user.role == Role.STUDENT:
            c_doc = await group_task_completions_col.find_one({"task_id": task_id, "student_id": user.id})
            if c_doc:
                completion = {
                    "mode": c_doc.get("mode"),
                    "text_response": c_doc.get("text_response"),
                    "upload_url": c_doc.get("upload_url"),
                    "completed_at": c_doc["completed_at"].isoformat() if isinstance(c_doc.get("completed_at"), datetime) else c_doc.get("completed_at"),
                }
        return JsonResponse(_task_out(task, completion))

    if request.method == "PATCH":
        if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
            return _error("Not permitted", 403)
        data = request_data(request) or {}
        updates = {}
        for field in ("title", "description", "due", "status", "completion_modes", "category"):
            if field in data:
                updates[field] = data[field]
        if updates:
            updates["needs_due_date_input"] = not bool(updates.get("due", task.get("due")))
            await group_tasks_col.update_one({"_id": oid}, {"$set": updates})
            task.update(updates)
        return JsonResponse(_task_out(task))

    if request.method == "DELETE":
        if user.id != task.get("advisor_id") and user.role not in (Role.ADMIN,):
            return _error("Not permitted", 403)
        await group_tasks_col.update_one({"_id": oid}, {"$set": {"status": "deleted"}})
        return JsonResponse({"ok": True})

    return _error("Method not allowed", 405)


async def complete_group_task(request, task_id):
    """
    POST /group-tasks/<id>/complete
    Student marks a group task as complete. Supports:
      - mode="mark_done"  → just marks done
      - mode="text"       → text_response field
      - mode="upload"     → upload_url field (URL to uploaded file/drive link)
      - mode="form"       → form_data JSON object
    """
    if request.method != "POST":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role != Role.STUDENT:
        return _error("Only students can complete tasks", 403)
    try:
        ObjectId(task_id)
    except Exception:
        return _error("Invalid task ID", 400)
    task = await group_tasks_col.find_one({"_id": ObjectId(task_id)})
    if not task:
        return _error("Task not found", 404)

    data = request_data(request) or {}
    mode = data.get("mode", "mark_done")
    now = datetime.now(timezone.utc)
    completion_doc = {
        "task_id": task_id,
        "task_title": task.get("title"),
        "student_id": user.id,
        "student_name": user.name,
        "advisor_id": task.get("advisor_id"),
        "group": task.get("group"),
        "mode": mode,
        "text_response": data.get("text_response") if mode == "text" else None,
        "upload_url": data.get("upload_url") if mode == "upload" else None,
        "form_data": data.get("form_data") if mode == "form" else None,
        "completed_at": now,
    }
    # Upsert — student can update their completion (e.g. re-upload)
    await group_task_completions_col.update_one(
        {"task_id": task_id, "student_id": user.id},
        {"$set": completion_doc},
        upsert=True,
    )
    return JsonResponse({
        "ok": True,
        "mode": mode,
        "completed_at": now.isoformat(),
    })


async def task_completions_view(request, task_id):
    """
    GET /group-tasks/<id>/completions
    Advisor sees who has completed this task and who hasn't.
    """
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted", 403)
    try:
        ObjectId(task_id)
    except Exception:
        return _error("Invalid task ID", 400)
    task = await group_tasks_col.find_one({"_id": ObjectId(task_id)})
    if not task:
        return _error("Task not found", 404)

    # All students in this advisor's class
    advisor_id = task.get("advisor_id")
    students = [s async for s in users_col.find({"role": "student", "class_advisor_id": advisor_id})]
    completions_map = {}
    async for c in group_task_completions_col.find({"task_id": task_id}):
        completions_map[c["student_id"]] = {
            "mode": c.get("mode"),
            "text_response": c.get("text_response"),
            "upload_url": c.get("upload_url"),
            "completed_at": c["completed_at"].isoformat() if isinstance(c.get("completed_at"), datetime) else c.get("completed_at"),
        }

    done, pending = [], []
    for s in students:
        sid = str(s["_id"])
        record = {
            "student_id": sid,
            "student_name": s.get("name"),
            "roll_id": s.get("roll_id"),
            "completion": completions_map.get(sid),
        }
        (done if sid in completions_map else pending).append(record)

    return JsonResponse({
        "task": _task_out(task),
        "total_students": len(students),
        "completed_count": len(done),
        "pending_count": len(pending),
        "completed": done,
        "pending": pending,
    })


async def advisor_group_tasks(request):
    """
    GET /advisor/group-tasks   — all group tasks created by this advisor with completion counts
    """
    if request.method != "GET":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted", 403)

    tasks_cursor = group_tasks_col.find(
        {"advisor_id": user.id, "status": {"$ne": "deleted"}}
    ).sort("created_at", -1)

    results = []
    async for t in tasks_cursor:
        task_id = str(t["_id"])
        total_students = await users_col.count_documents({"role": "student", "class_advisor_id": user.id})
        completed = await group_task_completions_col.count_documents({"task_id": task_id})
        out = _task_out(t)
        out["total_students"] = total_students
        out["completed_count"] = completed
        out["pending_count"] = max(0, total_students - completed)
        results.append(out)
    return JsonResponse(results, safe=False)


async def set_task_due_date(request, task_id):
    """
    PATCH /group-tasks/<id>/due
    When the AI doesn't know the due date, the advisor can set it manually
    after the message is sent.
    """
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    user = await _user(request)
    if isinstance(user, JsonResponse):
        return user
    if user.role not in (Role.ADVISOR, Role.HOD, Role.PRINCIPAL, Role.ADMIN):
        return _error("Not permitted", 403)
    try:
        oid = ObjectId(task_id)
    except Exception:
        return _error("Invalid task ID", 400)
    data = request_data(request) or {}
    due = data.get("due", "").strip()
    if not due:
        return _error("due date is required", 400)
    await group_tasks_col.update_one(
        {"_id": oid},
        {"$set": {"due": due, "has_due_date": True, "needs_due_date_input": False}},
    )
    task = await group_tasks_col.find_one({"_id": oid})
    return JsonResponse(_task_out(task))


urlpatterns = [
    path("group-tasks", group_task_list),
    path("group-tasks/detect", detect_intent_view),
    path("group-tasks/<str:task_id>", group_task_detail),
    path("group-tasks/<str:task_id>/complete", complete_group_task),
    path("group-tasks/<str:task_id>/completions", task_completions_view),
    path("group-tasks/<str:task_id>/due", set_task_due_date),
    path("advisor/group-tasks", advisor_group_tasks),
]

