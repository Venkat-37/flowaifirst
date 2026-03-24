"""routes/twins.py — Digital twin read + refresh + team health."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from database import activity_col, twins_col, insights_col, twin_history_col
from middleware.auth import get_current_user, require_hr_manager, owns_employee_data
from middleware.privacy import anonymize_twin_data
from services.scoring import compute_stats

router = APIRouter(prefix="/api/twins", tags=["twins"])


@router.get("/org-summary")
async def org_summary(user: dict = Depends(get_current_user)):
    """Organisation-wide twin summary for the HR command center."""
    col = twins_col()

    # Department aggregation
    dept_pipeline = [
        {"$group": {
            "_id": "$department",
            "count":          {"$sum": 1},
            "avg_efficiency": {"$avg": "$efficiency"},
            "avg_burnout":    {"$avg": "$burnout_score"},
            "avg_battery":    {"$avg": "$cognitive_battery"},
            "at_risk":        {"$sum": {"$cond": [{"$in": ["$risk_level", ["HIGH", "CRITICAL"]]}, 1, 0]}},
            "in_flow":        {"$sum": {"$cond": ["$focus_flow_state", 1, 0]}},
        }},
        {"$sort": {"avg_burnout": -1}},
    ]
    dept_stats = await col.aggregate(dept_pipeline).to_list(None)

    dept_formatted = [
        {
            "department":     d["_id"],
            "count":          d["count"],
            "avg_efficiency": round(d["avg_efficiency"], 1),
            "avg_burnout":    round(d["avg_burnout"], 1),
            "avg_battery":    round(d["avg_battery"], 1),
            "at_risk":        d["at_risk"],
            "in_flow":        d["in_flow"],
        }
        for d in dept_stats
    ]

    # Top 10 at-risk employees
    at_risk = await col.find(
        {"risk_level": {"$in": ["HIGH", "CRITICAL"]}},
        {"_id": 0, "emp_id": 1, "department": 1, "burnout_score": 1,
         "efficiency": 1, "risk_level": 1, "cognitive_battery": 1}
    ).sort("burnout_score", -1).limit(10).to_list(10)

    total = await col.count_documents({})
    payload = {
        "total_twins":       total,
        "dept_breakdown":    dept_formatted,
        "top_at_risk":       at_risk,
    }
    return anonymize_twin_data(payload, user.get("role"))


@router.get("/{emp_id}")
async def get_twin(emp_id: str, user: dict = Depends(get_current_user)):
    """Get digital twin for one employee."""
    emp_id = emp_id.strip().upper()
    if emp_id.isdigit():
        emp_id = f"EMP{int(emp_id):03d}"
        
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied — you may only view your own twin")
    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if not twin:
        raise HTTPException(404, f"Twin not found for {emp_id}")
    if "last_updated" in twin and hasattr(twin["last_updated"], "isoformat"):
        twin["last_updated"] = twin["last_updated"].isoformat()
    return twin


@router.post("/{emp_id}/sync")
async def sync_twin(emp_id: str, user: dict = Depends(get_current_user)):
    """Role-aware twin sync — employees sync their own, HR can sync any."""
    emp_id = emp_id.upper()

    # BOLA: employees can only sync their own twin
    if user.get("role") == "Employee" and user.get("emp_id") != emp_id:
        raise HTTPException(403, "You may only sync your own twin")

    events = await activity_col().find({"emp_id": emp_id}, {"_id": 0}).to_list(None)
    if not events:
        raise HTTPException(404, f"No activity data for {emp_id}")

    stats = compute_stats(events)
    dept  = events[0].get("department", "") if events else ""
    update = {**stats, "department": dept, "last_updated": datetime.utcnow()}

    await twins_col().update_one(
        {"emp_id": emp_id},
        {"$set": update},
        upsert=True,
    )
    
    # Save historical snapshot
    snapshot = {"emp_id": emp_id, "timestamp": datetime.utcnow(), **stats}
    snapshot.pop("_id", None)
    await twin_history_col().insert_one(snapshot)
    
    await insights_col().delete_one({"target_id": emp_id, "target_type": "employee"})

    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if twin and "last_updated" in twin:
        twin["last_updated"] = twin["last_updated"].isoformat()
    return twin


@router.post("/{emp_id}/refresh")
async def refresh_twin(emp_id: str, user: dict = Depends(require_hr_manager)):
    """Recompute digital twin from current activity data."""
    emp_id = emp_id.upper()
    events = await activity_col().find({"emp_id": emp_id}, {"_id": 0}).to_list(None)
    if not events:
        raise HTTPException(404, f"No activity data for {emp_id}")

    stats = compute_stats(events)
    dept  = events[0].get("department", "") if events else ""
    update = {**stats, "department": dept, "last_updated": datetime.utcnow()}

    await twins_col().update_one(
        {"emp_id": emp_id},
        {"$set": update},
        upsert=True,
    )
    
    # Save historical snapshot
    snapshot = {"emp_id": emp_id, "timestamp": datetime.utcnow(), **stats}
    snapshot.pop("_id", None)
    await twin_history_col().insert_one(snapshot)
    
    # Invalidate stale AI insight cache so next request regenerates
    await insights_col().delete_one({"target_id": emp_id, "target_type": "employee"})

    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if twin and "last_updated" in twin:
        twin["last_updated"] = twin["last_updated"].isoformat()
    return twin


# ── Forecast-aware refresh (includes actuation evaluation) ────────────────────

@router.post("/{emp_id}/refresh-with-actuation")
async def refresh_twin_actuated(emp_id: str, user: dict = Depends(require_hr_manager)):
    """
    Recompute twin and automatically fire actuation webhooks
    if the state transition warrants it (e.g. risk escalation, focus flow entry).
    """
    from services.actuation import evaluate_and_actuate
    from services.forecasting import compute_burnout_forecast

    emp_id = emp_id.upper()
    old_twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})

    events = await activity_col().find({"emp_id": emp_id}, {"_id": 0}).to_list(None)
    if not events:
        raise HTTPException(404, f"No activity data for {emp_id}")

    stats  = compute_stats(events)
    dept   = events[0].get("department", "") if events else ""
    update = {**stats, "department": dept, "last_updated": datetime.utcnow()}

    await twins_col().update_one({"emp_id": emp_id}, {"$set": update}, upsert=True)
    
    # Save historical snapshot
    snapshot = {"emp_id": emp_id, "timestamp": datetime.utcnow(), **stats}
    snapshot.pop("_id", None)
    await twin_history_col().insert_one(snapshot)
    
    # Invalidate stale AI insight cache
    await insights_col().delete_one({"target_id": emp_id, "target_type": "employee"})
    new_twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})

    # Fire actuation if state changed
    actuation_payload = await evaluate_and_actuate(emp_id, old_twin, new_twin)

    # Compute forecast
    forecast = compute_burnout_forecast(events, stats["burnout_score"])

    if new_twin and "last_updated" in new_twin:
        new_twin["last_updated"] = new_twin["last_updated"].isoformat()

    return {
        **new_twin,
        "forecast":   forecast,
        "actuation":  actuation_payload,
    }
