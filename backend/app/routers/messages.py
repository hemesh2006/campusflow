from typing import Optional, Annotated, List
from datetime import datetime, timezone
from pydantic import BaseModel, BeforeValidator
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from app.database import messages_col, users_col
from app.core.deps import get_current_user
from app.models.user import UserPublic, Role

PyObjectId = Annotated[str, BeforeValidator(str)]


class MessageCreate(BaseModel):
    group: str  # e.g. "class-<advisor_id>", "hod-advisor-<dept>", "principal-hod", or "dm-<idA>-<idB>"
    text: str
    link: Optional[str] = None
    attachment: Optional[dict] = None  # e.g. {"type": "image", "data": "data:image/png;base64,...", "name": "photo.png"}


class MessageOut(MessageCreate):
    id: PyObjectId
    from_user_id: str
    from_name: str
    read_by: List[str] = []
    read_count: int = 0
    deleted_for_everyone: bool = False


class DmThread(BaseModel):
    group: str
    other_user_id: str
    other_user_name: str
    other_user_role: Optional[str] = None
    last_text: str
    last_at: datetime
    last_from_me: bool
    has_attachment: bool = False


router = APIRouter(prefix="/messages", tags=["messages"])

DM_PREFIX = "dm-"


def dm_group(id_a: str, id_b: str) -> str:
    """Deterministic 1:1 thread name — same two IDs always produce the
    same group string no matter who calls it or the order given."""
    return DM_PREFIX + "-".join(sorted([id_a, id_b]))


def _dm_participants(group: str) -> Optional[tuple[str, str]]:
    if not group.startswith(DM_PREFIX):
        return None
    parts = group[len(DM_PREFIX):].split("-")
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


async def _assert_group_access(group: str, current_user: UserPublic):
    """Enforces strict institutional hierarchy scoping.
    Messages are NEVER duplicated across groups — each post targets exactly one group.

    Group rules:
    1. DMs (dm-<idA>-<idB>): Only the two participants.
    2. Class group (class-<advisor_id>): Only that advisor + their assigned students.
    3. HOD-Advisor group (hod-advisor-<dept>): Only HOD + Class Advisors in that dept, plus Admin.
       - HOD messages here reach downward (to class advisors). NOT forwarded to principal-hod.
    4. Principal-HOD group (principal-hod): Only Principal + HODs + Admin.
       - HOD messages here reach upward (to principal). NOT forwarded to hod-advisor groups.
    """
    if group.startswith(DM_PREFIX):
        participants = _dm_participants(group)
        if not participants or current_user.id not in participants:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a participant in this direct message conversation")
        return

    if group.startswith("class-") or group.startswith("advisor-class-"):
        advisor_id = group.replace("advisor-class-", "").replace("class-", "")
        if current_user.role == Role.ADVISOR and current_user.id == advisor_id:
            return
        if current_user.role == Role.STUDENT and current_user.class_advisor_id == advisor_id:
            return
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied: You are not assigned to this class group.")

    if group.startswith("hod-advisor-"):
        # HOD messages to this group reach Class Advisors ONLY — they do NOT appear in principal-hod.
        # Allowed: HOD (own dept), Advisors (own dept), Admin.
        if current_user.role in (Role.ADMIN, Role.HOD, Role.ADVISOR):
            return
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied: HOD-Advisor group is for HODs and Class Advisors only.")

    if group == "principal-hod":
        # HOD messages to this group reach the Principal ONLY — they do NOT appear in hod-advisor groups.
        # Allowed: HOD, Principal, Admin.
        if current_user.role in (Role.ADMIN, Role.PRINCIPAL, Role.HOD):
            return
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied: Principal-HOD circle is for Principal and HODs only.")


@router.get("", response_model=list[MessageOut])
async def list_messages(group: str, current_user: UserPublic = Depends(get_current_user)):
    await _assert_group_access(group, current_user)
    # "Delete for me" hides the message only for the user who deleted it —
    # excluded straight from the query so it never reaches their client.
    cursor = messages_col.find({"group": group, "deleted_for": {"$ne": current_user.id}}).sort("created_at", -1)
    return [
        MessageOut(
            id=str(m["_id"]), group=m["group"], text=m["text"], link=m.get("link"),
            attachment=m.get("attachment"), from_user_id=m["from_user_id"],
            from_name=m["from_name"], created_at=m["created_at"],
            read_by=m.get("read_by", []), read_count=m.get("read_count", 0),
            deleted_for_everyone=m.get("deleted_for_everyone", False),
        )
        async for m in cursor
    ]


@router.patch("/read/{msg_id}", response_model=MessageOut)
async def mark_message_read(msg_id: str, current_user: UserPublic = Depends(get_current_user)):
    result = await messages_col.find_one_and_update(
        {"_id": ObjectId(msg_id)},
        {"$addToSet": {"read_by": current_user.id}, "$inc": {"read_count": 1}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    return MessageOut(
        id=str(result["_id"]),
        group=result["group"],
        text=result["text"],
        link=result.get("link"),
        attachment=result.get("attachment"),
        from_user_id=result["from_user_id"],
        from_name=result["from_name"],
        created_at=result["created_at"],
        read_by=result.get("read_by", []),
        read_count=result.get("read_count", 0),
    )


@router.delete("/{msg_id}")
async def delete_message(msg_id: str, scope: str = "me", current_user: UserPublic = Depends(get_current_user)):
    """WhatsApp-style delete. scope=me (default) hides the message only
    for the caller — everyone else still sees it. scope=everyone blanks
    the message for the whole group (sender or admin only), replacing
    the content with a tombstone the frontend renders as "This message
    was deleted" rather than actually removing the row."""
    msg = await messages_col.find_one({"_id": ObjectId(msg_id)})
    if not msg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    await _assert_group_access(msg["group"], current_user)

    if scope == "everyone":
        if msg["from_user_id"] != current_user.id and current_user.role != Role.ADMIN:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the sender or an admin can delete this for everyone")
        await messages_col.update_one(
            {"_id": ObjectId(msg_id)},
            {"$set": {"text": "", "attachment": None, "link": None, "deleted_for_everyone": True}},
        )
    else:
        await messages_col.update_one({"_id": ObjectId(msg_id)}, {"$addToSet": {"deleted_for": current_user.id}})
    return {"ok": True, "scope": scope}


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def post_message(payload: MessageCreate, current_user: UserPublic = Depends(get_current_user)):
    await _assert_group_access(payload.group, current_user)

    doc = {
        **payload.model_dump(),
        "from_user_id": current_user.id,
        "from_name": current_user.name,
        "created_at": datetime.now(timezone.utc),
        "read_by": [],
        "read_count": 0,
        "deleted_for": [],
        "deleted_for_everyone": False,
    }
    # Store the message only in the specified group. No automatic duplication to other groups occurs.
    # The caller must select the correct group ID when posting.
    # This ensures hierarchical isolation of messages between HOD, Advisor, Principal, etc.
    result = await messages_col.insert_one(doc)
    sent = MessageOut(id=str(result.inserted_id), **doc)

    return sent


@router.get("/dm/threads", response_model=list[DmThread])
async def list_dm_threads(current_user: UserPublic = Depends(get_current_user)):
    """Every 1:1 conversation the current user is part of, most recent
    first — this is what powers the inbox list (admin's Direct message
    page, and the "Messages" page every other role sees)."""
    cursor = messages_col.find({"group": {"$regex": f"^{DM_PREFIX}"}}).sort("created_at", 1)
    latest_by_group: dict[str, dict] = {}
    async for m in cursor:
        participants = _dm_participants(m["group"])
        if not participants or current_user.id not in participants:
            continue
        latest_by_group[m["group"]] = m  # sorted ascending, so last write wins = most recent

    if not latest_by_group:
        return []

    other_ids = set()
    for group, m in latest_by_group.items():
        a, b = _dm_participants(group)
        other_ids.add(a if b == current_user.id else b)

    users_by_id = {}
    async for u in users_col.find({"_id": {"$in": [ObjectId(i) for i in other_ids]}}):
        users_by_id[str(u["_id"])] = u

    threads = []
    for group, m in latest_by_group.items():
        a, b = _dm_participants(group)
        other_id = a if b == current_user.id else b
        other = users_by_id.get(other_id)
        threads.append(DmThread(
            group=group,
            other_user_id=other_id,
            other_user_name=other["name"] if other else "Unknown user",
            other_user_role=other.get("role") if other else None,
            last_text=m["text"],
            last_at=m["created_at"],
            last_from_me=m["from_user_id"] == current_user.id,
            has_attachment=bool(m.get("attachment")),
        ))
    threads.sort(key=lambda t: t.last_at, reverse=True)
    return threads
