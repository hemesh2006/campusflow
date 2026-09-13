"""Reports & escalations — replaces the static REPORTS mock data. Any
authenticated user can file a report; Admin sees every report, HOD sees
reports filed by people in their own department. Powers AdminReports.jsx
(Forward to HOD / Mark resolved) and the "Recent reports" card on
HodDashboard.jsx. See info.md."""
from typing import Annotated, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, BeforeValidator
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId

from campusflow.backend.app.database import reports_col
from campusflow.backend.app.core.deps import get_current_user, require_role
from campusflow.backend.app.models.user import UserPublic, Role

PyObjectId = Annotated[str, BeforeValidator(str)]

VALID_STATUSES = {"open", "investigating", "resolved"}


class ReportCreate(BaseModel):
    subject: str
    body: Optional[str] = None


class ReportStatusUpdate(BaseModel):
    status: str  # open | investigating | resolved


class ReportOut(BaseModel):
    id: PyObjectId
    subject: str
    body: Optional[str] = None
    from_user_id: str
    from_name: str
    from_dept: Optional[str] = None
    status: str = "open"
    created_at: datetime


def _to_out(r: dict) -> ReportOut:
    return ReportOut(
        id=str(r["_id"]), subject=r["subject"], body=r.get("body"),
        from_user_id=r["from_user_id"], from_name=r["from_name"],
        from_dept=r.get("from_dept"), status=r.get("status", "open"),
        created_at=r["created_at"],
    )


router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def file_report(payload: ReportCreate, current_user: UserPublic = Depends(get_current_user)):
    """Any logged-in role can file a report — students reporting an
    issue with an agent, advisors escalating to HOD, etc."""
    doc = {
        "subject": payload.subject,
        "body": payload.body,
        "from_user_id": current_user.id,
        "from_name": current_user.name,
        "from_dept": current_user.dept,
        "status": "open",
        "created_at": datetime.now(timezone.utc),
    }
    result = await reports_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_out(doc)


@router.get("", response_model=list[ReportOut])
async def list_reports(current_user: UserPublic = Depends(require_role(Role.ADMIN, Role.HOD, Role.PRINCIPAL))):
    """Admin/Principal see every report; a HOD only sees reports filed by
    people in their own department."""
    query = {}
    if current_user.role == Role.HOD and current_user.dept:
        query["from_dept"] = current_user.dept
    cursor = reports_col.find(query).sort("created_at", -1)
    return [_to_out(r) async for r in cursor]


@router.patch("/{report_id}", response_model=ReportOut)
async def update_report_status(
    report_id: str, payload: ReportStatusUpdate,
    current_user: UserPublic = Depends(require_role(Role.ADMIN, Role.HOD)),
):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"status must be one of {sorted(VALID_STATUSES)}")
    report = await reports_col.find_one({"_id": ObjectId(report_id)})
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    if current_user.role == Role.HOD and report.get("from_dept") != current_user.dept:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your department's report")
    await reports_col.update_one({"_id": report["_id"]}, {"$set": {"status": payload.status}})
    report["status"] = payload.status
    return _to_out(report)
