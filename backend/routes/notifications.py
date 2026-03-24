# routes/notifications.py — fixed
"""routes/notifications.py — Employee notification inbox endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from bson.errors import InvalidId
from database import notifications_col
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _safe_object_id(id_str: str) -> ObjectId:
    """Convert string to ObjectId, raising a clean 400 if malformed."""
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(400, f"Invalid notification ID format: {id_str!r}")


@router.get("")
async def get_my_notifications(user: dict = Depends(get_current_user)):
    """Return the 30 most recent notifications for the logged-in employee."""
    emp_id = (user.get("emp_id") or "").upper()
    if not emp_id:
        return {"notifications": [], "unread_count": 0}

    col  = notifications_col()
    docs = await col.find(
        {"emp_id": emp_id},
        {"_id": 1, "type": 1, "trigger": 1, "title": 1, "message": 1,
         "severity": 1, "actions": 1, "context": 1, "read": 1, "created_at": 1},
    ).sort("created_at", -1).limit(30).to_list(30)

    for d in docs:
        d["id"] = str(d.pop("_id"))
        if hasattr(d.get("created_at"), "isoformat"):
            d["created_at"] = d["created_at"].isoformat()

    unread = sum(1 for d in docs if not d.get("read", False))
    return {"notifications": docs, "unread_count": unread}


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: dict = Depends(get_current_user),
):
    """Mark one notification as read. Only the owning employee can mark their own."""
    emp_id = (user.get("emp_id") or "").upper()
    oid    = _safe_object_id(notification_id)   # raises 400 if malformed
    col    = notifications_col()

    result = await col.update_one(
        {"_id": oid, "emp_id": emp_id},   # emp_id guard prevents reading others' notifications
        {"$set": {"read": True}},
    )
    return {"ok": result.modified_count > 0}


@router.patch("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    """Mark all of this employee's notifications as read."""
    emp_id = (user.get("emp_id") or "").upper()
    if not emp_id:
        return {"ok": False, "marked": 0}

    col    = notifications_col()
    result = await col.update_many(
        {"emp_id": emp_id, "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True, "marked": result.modified_count}