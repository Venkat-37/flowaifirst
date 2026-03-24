# routes/pto.py
"""routes/pto.py — PTO and leave pattern logging and analysis.

PTO absence feeds the MBI Personal Accomplishment dimension.
Employees with zero PTO in 90 days receive a PA penalty in scoring.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from database import pto_logs_col
from middleware.auth import get_current_user, require_hr_manager, owns_employee_data

router = APIRouter(prefix="/api/pto", tags=["pto"])


# ── Log a leave day ───────────────────────────────────────────────────────────

@router.post("/log")
async def log_pto(body: dict, user: dict = Depends(get_current_user)):
    """
    Record a PTO / leave day.
    Employee logs their own; HR can log on behalf of any employee.
    """
    emp_id     = str(body.get("emp_id", user.get("emp_id", ""))).upper()
    leave_date = str(body.get("date", datetime.utcnow().strftime("%Y-%m-%d")))
    leave_type = str(body.get("type", "PTO"))   # PTO | SICK | PUBLIC_HOLIDAY

    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")

    await pto_logs_col().update_one(
        {"emp_id": emp_id, "date": leave_date},
        {"$set": {
            "emp_id":     emp_id,
            "date":       leave_date,
            "type":       leave_type,
            "logged_at":  datetime.utcnow(),
            "logged_by":  user.get("sub", ""),
        }},
        upsert=True,
    )
    return {"status": "logged", "emp_id": emp_id, "date": leave_date, "type": leave_type}


# ── Get PTO summary (feeds PA scoring) ───────────────────────────────────────

@router.get("/summary/{emp_id}")
async def pto_summary(emp_id: str, user: dict = Depends(get_current_user)):
    """
    Returns PTO stats for the last 90 days.
    Used by the MBI engine to adjust Personal Accomplishment scoring.
    """
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")

    cutoff     = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
    today_str  = datetime.utcnow().strftime("%Y-%m-%d")

    docs = await pto_logs_col().find(
        {"emp_id": emp_id, "date": {"$gte": cutoff, "$lte": today_str}},
        {"_id": 0},
    ).sort("date", -1).to_list(None)

    days_off_90d = len(docs)

    # Consecutive working days — days since last PTO
    if docs:
        last_pto = docs[0]["date"]   # most recent
        last_dt  = datetime.strptime(last_pto, "%Y-%m-%d")
        consec_work_days = (datetime.utcnow() - last_dt).days
    else:
        consec_work_days = 90        # no PTO in 90 days → treat as 90 consecutive

    # PA adjustment signal (used by MBI engine)
    pa_adjustment = _compute_pa_adjustment(days_off_90d, consec_work_days)

    return {
        "emp_id":             emp_id,
        "days_off_last_90d":  days_off_90d,
        "consecutive_work_days": consec_work_days,
        "pa_adjustment":      pa_adjustment,
        "pa_adjustment_reason": _pa_reason(days_off_90d, consec_work_days),
        "recent_pto":         docs[:5],
    }


@router.get("/department/{dept}")
async def department_pto(dept: str, user: dict = Depends(require_hr_manager)):
    """PTO summary for all employees in a department. HR only."""
    import re
    cutoff = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")

    pipeline = [
        {"$match": {"date": {"$gte": cutoff}}},
        {"$lookup": {
            "from":         "employees",
            "localField":   "emp_id",
            "foreignField": "emp_id",
            "as":           "emp_info",
        }},
        {"$unwind": {"path": "$emp_info", "preserveNullAndEmptyArrays": True}},
        {"$match": {
            "emp_info.department": {
                "$regex": f"^{re.escape(dept)}$", "$options": "i"
            }
        }},
        {"$group": {
            "_id":           "$emp_id",
            "days_off_90d":  {"$sum": 1},
            "last_pto_date": {"$max": "$date"},
        }},
        {"$sort": {"days_off_90d": 1}},   # sorted ascending — low PTO at top
    ]
    rows = await pto_logs_col().aggregate(pipeline).to_list(500)

    # Flag employees with zero PTO (not in the results at all)
    from database import employees_col
    dept_emps = await employees_col().find(
        {"department": {"$regex": f"^{re.escape(dept)}$", "$options": "i"}},
        {"emp_id": 1, "_id": 0},
    ).to_list(500)

    pto_emp_ids = {r["_id"] for r in rows}
    zero_pto = [
        {"emp_id": e["emp_id"], "days_off_90d": 0, "last_pto_date": None}
        for e in dept_emps if e["emp_id"] not in pto_emp_ids
    ]

    return {
        "department":    dept,
        "employees":     zero_pto + rows,
        "zero_pto_count": len(zero_pto),
    }


# ── PA scoring helpers (pure functions — no DB) ───────────────────────────────

def _compute_pa_adjustment(days_off_90d: int, consec_work_days: int) -> float:
    """
    Returns a multiplier applied to the MBI PA score.
    1.0 = no adjustment. < 1.0 = PA penalty (burnout signal).

    Rule:
      Zero PTO in 90 days     → 0.70 (strong PA penalty)
      1-3 days off            → 0.85
      No break for 20+ days   → additional 0.90 multiplier
    """
    base = 1.0
    if days_off_90d == 0:
        base *= 0.70
    elif days_off_90d <= 3:
        base *= 0.85
    if consec_work_days >= 20:
        base *= 0.90
    return round(base, 2)


def _pa_reason(days_off_90d: int, consec_work_days: int) -> str:
    if days_off_90d == 0:
        return f"No PTO taken in 90 days — high burnout risk signal"
    if consec_work_days >= 20:
        return f"No break in {consec_work_days} consecutive days"
    return "PTO pattern within healthy range"