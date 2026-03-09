"""routes/telemetry.py — Ingest live telemetry events."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends
from database import activity_col, twins_col
from middleware.auth import get_current_user
from models import TelemetryIngest
from services.scoring import compute_stats
from services.audit import log_event_bg, TELEMETRY_INGEST

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.post("/ingest")
async def ingest_event(event: TelemetryIngest, user: dict = Depends(get_current_user)):
    """
    Ingest a single live telemetry event from the desktop agent.
    Updates the employee's digital twin immediately.
    """
    emp_id = event.emp_id.upper()
    doc = {
        "emp_id":       emp_id,
        "timestamp":    event.timestamp or datetime.utcnow(),
        "app_name":     event.app_name,
        "window_title": event.window_title,
        "category":     event.category,
        "department":   "",  # could look up from employee record
    }
    await activity_col().insert_one(doc)

    # Recompute twin from last 100 events for responsiveness
    recent = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)

    if recent:
        stats = compute_stats(recent)
        await twins_col().update_one(
            {"emp_id": emp_id},
            {"$set": {**stats, "last_updated": datetime.utcnow()}},
            upsert=True,
        )

    log_event_bg(TELEMETRY_INGEST, actor=user.get("sub", ""), target=emp_id,
                 details={"app_name": event.app_name, "category": event.category, "source": "authenticated"})
    return {"status": "ok", "emp_id": emp_id}


@router.post("/agent-ingest")
async def agent_ingest(event: TelemetryIngest):
    """
    Ingest telemetry from the desktop monitor agent.
    No JWT required — used by the local monitoring script.
    """
    emp_id = event.emp_id.upper()
    doc = {
        "emp_id":       emp_id,
        "timestamp":    event.timestamp or datetime.utcnow(),
        "app_name":     event.app_name,
        "window_title": event.window_title,
        "category":     event.category,
        "department":   "",
    }
    await activity_col().insert_one(doc)

    # Recompute twin from last 100 events
    recent = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)

    if recent:
        stats = compute_stats(recent)
        await twins_col().update_one(
            {"emp_id": emp_id},
            {"$set": {**stats, "last_updated": datetime.utcnow()}},
            upsert=True,
        )

    log_event_bg(TELEMETRY_INGEST, actor="agent", target=emp_id,
                 details={"app_name": event.app_name, "category": event.category, "source": "desktop_agent"})
    return {"status": "ok", "emp_id": emp_id}


@router.get("/hr-overview")
async def hr_overview(user: dict = Depends(get_current_user)):
    """
    Legacy endpoint mirroring original /api/hr-stats shape.
    Used by components that need a simple flat stats object.
    """
    col = twins_col()
    all_twins = await col.find({}, {"_id": 0}).to_list(None)

    if not all_twins:
        return {"efficiency": 0, "burnout_risk": 0, "total_staff": 0, "departments": {}}

    total_staff = len(all_twins)
    avg_eff     = sum(t["efficiency"] for t in all_twins) / total_staff
    at_risk     = sum(1 for t in all_twins if t["risk_level"] in ("HIGH", "CRITICAL"))

    dept_map: dict[str, list] = {}
    for t in all_twins:
        dept_map.setdefault(t["department"], []).append(t["efficiency"])
    dept_eff = {d: round(sum(v) / len(v), 1) for d, v in dept_map.items()}

    return {
        "efficiency":  round(avg_eff, 1),
        "burnout_risk": at_risk,
        "total_staff":  total_staff,
        "departments":  dept_eff,
    }
