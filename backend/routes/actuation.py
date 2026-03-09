"""routes/actuation.py — Actuation webhook endpoints."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from database import get_db, twins_col
from middleware.auth import get_current_user, require_hr_manager
from services.actuation import fire_actuation, evaluate_and_actuate
from services.actuation import (
    TRIGGER_DO_NOT_DISTURB, TRIGGER_DEEP_WORK_MODE,
    TRIGGER_RESUME_NORMAL, TRIGGER_WELLNESS_ALERT, TRIGGER_CRITICAL_ALERT
)

router = APIRouter(prefix="/api/actuation", tags=["actuation"])

VALID_TRIGGERS = {
    TRIGGER_DO_NOT_DISTURB, TRIGGER_DEEP_WORK_MODE,
    TRIGGER_RESUME_NORMAL,  TRIGGER_WELLNESS_ALERT,
    TRIGGER_CRITICAL_ALERT,
}


@router.post("/trigger")
async def manual_trigger(body: dict, user: dict = Depends(require_hr_manager)):
    """
    Manually fire an actuation trigger for an employee.
    HR Manager only. Used to test the webhook bridge or trigger interventions.
    """
    emp_id      = body.get("emp_id", "").upper()
    trigger     = body.get("trigger", "")
    webhook_url = body.get("webhook_url")  # optional override

    if not emp_id:
        raise HTTPException(400, "emp_id is required")
    if trigger not in VALID_TRIGGERS:
        raise HTTPException(400, f"trigger must be one of: {sorted(VALID_TRIGGERS)}")

    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    context = {
        "burnout_score":    (twin or {}).get("burnout_score", 0),
        "risk_level":       (twin or {}).get("risk_level", "UNKNOWN"),
        "triggered_by":     "HR Manager",
        "manual_override":  True,
    }

    payload = await fire_actuation(emp_id, trigger, context, webhook_url=webhook_url)
    return {"status": "fired", "payload": payload}


@router.get("/history/{emp_id}")
async def actuation_history(emp_id: str, user: dict = Depends(get_current_user)):
    """Return recent actuation events for one employee (last 20)."""
    emp_id = emp_id.upper()
    col    = get_db()["actuations"]
    docs   = await col.find(
        {"emp_id": emp_id},
        {"_id": 0, "_id_ts": 0}
    ).sort("timestamp", -1).limit(20).to_list(20)
    return {"emp_id": emp_id, "actuations": docs}


@router.get("/history")
async def all_actuation_history(user: dict = Depends(require_hr_manager)):
    """Return last 50 actuation events org-wide. HR Manager only."""
    col  = get_db()["actuations"]
    docs = await col.find({}, {"_id": 0, "_id_ts": 0}).sort("timestamp", -1).limit(50).to_list(50)
    return {"actuations": docs}


@router.get("/available-triggers")
async def list_triggers(user: dict = Depends(get_current_user)):
    """List all available trigger types and their descriptions."""
    return {
        "triggers": [
            {"id": TRIGGER_DO_NOT_DISTURB,  "label": "Do Not Disturb",
             "description": "Activate DND on Slack/Teams when burnout is HIGH"},
            {"id": TRIGGER_DEEP_WORK_MODE,  "label": "Deep Work Mode",
             "description": "Signal focus state to collaboration tools"},
            {"id": TRIGGER_RESUME_NORMAL,   "label": "Resume Normal",
             "description": "Clear all overrides when risk drops to LOW/MEDIUM"},
            {"id": TRIGGER_WELLNESS_ALERT,  "label": "Wellness Alert",
             "description": "Send wellness check-in nudge to employee"},
            {"id": TRIGGER_CRITICAL_ALERT,  "label": "Critical Burnout Alert",
             "description": "Flag for HR manager review"},
        ]
    }
