# routes/consent.py
"""routes/consent.py — Employee consent management.

GDPR / CCPA requirement: monitoring must not begin until consent is recorded.
The telemetry ingest endpoint checks consent before accepting any events.

Collections used: consent_records (via database.py helper)
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from database import consent_records_col
from middleware.auth import get_current_user, owns_employee_data

router = APIRouter(prefix="/api/consent", tags=["consent"])


# ── Give consent ──────────────────────────────────────────────────────────────

@router.post("/give")
async def give_consent(
    body: dict,
    user: dict = Depends(get_current_user),
):
    """
    Employee records informed consent to monitoring.
    Called on first login before telemetry collection begins.
    """
    emp_id          = (user.get("emp_id") or "").upper()
    consent_version = str(body.get("consent_version", "1.0"))

    if not emp_id:
        raise HTTPException(400, "emp_id is required — link your account to an employee record first")

    await consent_records_col().update_one(
        {"emp_id": emp_id},
        {"$set": {
            "emp_id":            emp_id,
            "consent_given":     True,
            "consent_date":      datetime.utcnow(),
            "consent_version":   consent_version,
            "withdrawn_date":    None,
        }},
        upsert=True,
    )
    return {
        "status":          "consent_recorded",
        "emp_id":          emp_id,
        "consent_version": consent_version,
        "consent_date":    datetime.utcnow().isoformat(),
    }


# ── Withdraw consent ──────────────────────────────────────────────────────────

@router.post("/withdraw")
async def withdraw_consent(user: dict = Depends(get_current_user)):
    """
    Employee withdraws consent. Telemetry ingest stops immediately.
    Existing data is retained until an erasure request is made.
    """
    emp_id = (user.get("emp_id") or "").upper()
    if not emp_id:
        raise HTTPException(400, "No employee record linked to this account")

    await consent_records_col().update_one(
        {"emp_id": emp_id},
        {"$set": {
            "consent_given":  False,
            "withdrawn_date": datetime.utcnow(),
        }},
        upsert=True,
    )
    return {"status": "consent_withdrawn", "emp_id": emp_id}


# ── Check consent status ──────────────────────────────────────────────────────

@router.get("/status/{emp_id}")
async def consent_status(
    emp_id: str,
    user: dict   = Depends(get_current_user),
):
    """
    Check whether an employee has active consent.
    Employee can check their own; HR/Admin can check anyone.
    """
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")

    doc = await consent_records_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if not doc:
        return {"emp_id": emp_id, "consent_given": False, "status": "never_consented"}

    return {
        "emp_id":          emp_id,
        "consent_given":   doc.get("consent_given", False),
        "consent_version": doc.get("consent_version"),
        "consent_date":    doc["consent_date"].isoformat() if doc.get("consent_date") else None,
        "withdrawn_date":  doc["withdrawn_date"].isoformat() if doc.get("withdrawn_date") else None,
        "status":          "active" if doc.get("consent_given") else "withdrawn",
    }