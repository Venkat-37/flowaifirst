"""routes/admin.py — Admin endpoints for role and user management (v3.3)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from database import get_db, users_col
from middleware.auth import get_current_user, require_hr_manager

router = APIRouter(prefix="/api/admin", tags=["admin"])

VALID_ROLES = {"employee", "hr_manager", "admin"}


# ── List all users ─────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(user: dict = Depends(require_hr_manager)):
    """
    List all registered users with their roles.
    Returns up to 1000 records. HR Manager / Admin only.
    """
    col = users_col()
    docs = await col.find(
        {},
        {"_id": 0, "google_uid": 1, "email": 1, "role": 1, "emp_id": 1, "created_at": 1}
    ).to_list(1000)
    return {"users": docs}


# ── Get single user ────────────────────────────────────────────────────────────

@router.get("/users/{google_uid}")
async def get_user(google_uid: str, user: dict = Depends(require_hr_manager)):
    """Get a single user's details by Firebase UID. HR Manager / Admin only."""
    col = users_col()
    doc = await col.find_one({"google_uid": google_uid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "User not found")
    return doc


# ── Update role ────────────────────────────────────────────────────────────────

@router.patch("/users/{google_uid}/role")
async def update_user_role(
    google_uid: str,
    body: dict,
    user: dict = Depends(require_hr_manager),
):
    """
    Update a user's role. HR Manager / Admin only.
    Body: { "role": "employee" | "hr_manager" | "admin" }

    Safety rules:
      - Role must be one of the three valid values.
      - An HR manager cannot demote themselves; another admin must do it.
    """
    new_role = body.get("role", "").strip().lower()

    if new_role not in VALID_ROLES:
        raise HTTPException(400, f"role must be one of: {sorted(VALID_ROLES)}")

    # Prevent self-demotion
    if google_uid == user.get("sub") and new_role != user.get("role"):
        raise HTTPException(
            400,
            "Cannot change your own role — another HR manager or admin must do this",
        )

    col = users_col()
    result = await col.update_one(
        {"google_uid": google_uid},
        {"$set": {"role": new_role}},
    )

    if result.matched_count == 0:
        raise HTTPException(404, "User not found")

    return {"status": "updated", "google_uid": google_uid, "new_role": new_role}


# ── Link user to employee record ───────────────────────────────────────────────

@router.patch("/users/{google_uid}/link")
async def link_employee(
    google_uid: str,
    body: dict,
    user: dict = Depends(require_hr_manager),
):
    """
    Link a user account to an employee ID. HR Manager / Admin only.
    Body: { "emp_id": "EMP001" }

    Validation:
      - emp_id must be non-empty.
      - The employee record must exist.
      - The emp_id must not already be linked to a different user account.
    """
    emp_id = body.get("emp_id", "").strip().upper()
    if not emp_id:
        raise HTTPException(400, "emp_id is required")

    db = get_db()

    # Verify employee record exists
    emp = await db["employees"].find_one({"emp_id": emp_id})
    if not emp:
        raise HTTPException(404, f"Employee {emp_id} not found")

    # Guard against double-linking
    existing = await db["users"].find_one({"emp_id": emp_id, "google_uid": {"$ne": google_uid}})
    if existing:
        raise HTTPException(409, f"Employee {emp_id} is already linked to another user")

    result = await db["users"].update_one(
        {"google_uid": google_uid},
        {"$set": {"emp_id": emp_id}},
    )

    if result.matched_count == 0:
        raise HTTPException(404, "User not found")

    return {"status": "linked", "uid": google_uid, "emp_id": emp_id}


# ── Debug employee pipeline ────────────────────────────────────────────────────

@router.get("/debug/{emp_id}")
async def debug_employee(emp_id: str, user: dict = Depends(require_hr_manager)):
    """
    Fetch the raw digital twin state and recent telemetry for an employee.
    Intended for admins diagnosing data-pipeline issues.
    Returns twin existence, full twin document, last 50 activity events,
    and the most recent event for quick triage.
    HR Manager / Admin only.
    """
    db = get_db()
    emp_id = emp_id.strip().upper()

    # Verify employee exists before querying pipeline tables
    emp = await db["employees"].find_one({"emp_id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, f"Employee {emp_id} not found")

    twin = await db["digital_twins"].find_one({"emp_id": emp_id}, {"_id": 0})

    recent_events = (
        await db["activity_events"]
        .find({"emp_id": emp_id}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(50)
        .to_list(50)
    )

    return {
        "status": "success",
        "emp_id": emp_id,
        "employee": emp,
        "twin_exists": twin is not None,
        "twin_data": twin,
        "recent_telemetry_count": len(recent_events),
        "recent_events": recent_events,
        "last_event": recent_events[0] if recent_events else None,
    }


# ── Update employee mapping ───────────────────────────────────────────────────

@router.patch("/employees/{emp_id}/mapping")
async def update_employee_mapping(
    emp_id: str,
    body: dict, # Using dict to simplify for now, can be EmployeeMappingUpdate
    user: dict = Depends(require_hr_manager),
):
    """
    Update employee job mapping (dept, level, etc.).
    HR Manager / Admin only.
    """
    db = get_db()
    emp_id = emp_id.strip().upper()
    
    # Check if employee exists
    emp = await db["employees"].find_one({"emp_id": emp_id})
    if not emp:
        from fastapi import HTTPException
        raise HTTPException(404, f"Employee {emp_id} not found")
        
    update_data = {k: v for k, v in body.items() if v is not None}
    if not update_data:
        from fastapi import HTTPException
        raise HTTPException(400, "No data provided for update")
        
    # Update employees collection
    await db["employees"].update_one(
        {"emp_id": emp_id},
        {"$set": update_data}
    )
    
    # Also update digital_twins collection to stay in sync
    await db["digital_twins"].update_one(
        {"emp_id": emp_id},
        {"$set": update_data}
    )
    
    return {"status": "updated", "emp_id": emp_id, "fields": list(update_data.keys())}