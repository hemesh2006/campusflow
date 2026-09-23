import json
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from django.http import JsonResponse
from django.urls import path
from pydantic import BaseModel, ValidationError

from app.database import reports_col
from app.core.deps import get_current_user
from app.models.user import Role


class ReportCreate(BaseModel):
    subject: str
    body: Optional[str] = None


class ReportStatusUpdate(BaseModel):
    status: str


VALID_STATUSES = {"open", "investigating", "resolved"}


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _error(detail, status_code):
    return JsonResponse({"detail": detail}, status=status_code)


def _out(report):
    return {
        "id": str(report["_id"]),
        "subject": report["subject"],
        "body": report.get("body"),
        "from_user_id": report["from_user_id"],
        "from_name": report["from_name"],
        "from_dept": report.get("from_dept"),
        "status": report.get("status", "open"),
        "created_at": report["created_at"].isoformat(),
    }


async def _user(request):
    try:
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


async def reports_collection(request):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if request.method == "POST":
        try:
            payload = ReportCreate.model_validate(_body(request))
        except ValidationError as exc:
            return _error(exc.errors(), 422)
        document = {
            "subject": payload.subject,
            "body": payload.body,
            "from_user_id": current_user.id,
            "from_name": current_user.name,
            "from_dept": current_user.dept,
            "status": "open",
            "created_at": datetime.now(timezone.utc),
        }
        result = await reports_col.insert_one(document)
        document["_id"] = result.inserted_id
        return JsonResponse(_out(document), status=201)
    if request.method != "GET":
        return _error("Method not allowed", 405)
    if current_user.role not in (Role.ADMIN, Role.HOD, Role.PRINCIPAL):
        return _error("Not permitted for this role", 403)
    query = {"from_dept": current_user.dept} if current_user.role == Role.HOD and current_user.dept else {}
    reports = [_out(report) async for report in reports_col.find(query).sort("created_at", -1)]
    return JsonResponse(reports, safe=False)


async def update_report(request, report_id):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if current_user.role not in (Role.ADMIN, Role.HOD):
        return _error("Not permitted for this role", 403)
    try:
        object_id = ObjectId(report_id)
        payload = ReportStatusUpdate.model_validate(_body(request))
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    except Exception:
        return _error("Invalid report ID", 400)
    if payload.status not in VALID_STATUSES:
        return _error(f"status must be one of {sorted(VALID_STATUSES)}", 422)
    report = await reports_col.find_one({"_id": object_id})
    if not report:
        return _error("Report not found", 404)
    if current_user.role == Role.HOD and report.get("from_dept") != current_user.dept:
        return _error("Not your department's report", 403)
    await reports_col.update_one({"_id": object_id}, {"$set": {"status": payload.status}})
    report["status"] = payload.status
    return JsonResponse(_out(report))


urlpatterns = [
    path("reports", reports_collection),
    path("reports/<str:report_id>", update_report),
]
