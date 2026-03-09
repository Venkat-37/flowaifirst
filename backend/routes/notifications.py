"""routes/notifications.py — Employee notification endpoints."""
from __future__ import annotations
from bson import ObjectId
from fastapi import APIRouter, Depends
from database import notifications_col
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_my_notifications(user: dict = Depends(get_current_user)):
    """Get notifications for the logged-in employee."""
    emp_id = user.get("emp_id")
    if not emp_id:
        return {"notifications": [], "unread_count": 0}

    col = notifications_col()
    docs = await col.find(
        {"emp_id": emp_id.upper()},
        {"_id": 1, "type": 1, "trigger": 1, "title": 1, "message": 1,
         "severity": 1, "actions": 1, "context": 1, "read": 1, "created_at": 1}
    ).sort("created_at", -1).limit(30).to_list(30)

    # Convert ObjectId to string
    for d in docs:
        d["id"] = str(d.pop("_id"))

    unread = sum(1 for d in docs if not d.get("read", False))

    return {"notifications": docs, "unread_count": unread}


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    """Mark a single notification as read."""
    col = notifications_col()
    emp_id = user.get("emp_id", "").upper()

    result = await col.update_one(
        {"_id": ObjectId(notification_id), "emp_id": emp_id},
        {"$set": {"read": True}},
    )
    return {"ok": result.modified_count > 0}


@router.patch("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    """Mark all notifications for this employee as read."""
    col = notifications_col()
    emp_id = user.get("emp_id", "").upper()

    result = await col.update_many(
        {"emp_id": emp_id, "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True, "marked": result.modified_count}
