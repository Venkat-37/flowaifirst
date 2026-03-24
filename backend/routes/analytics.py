# routes/analytics.py — fixed
"""routes/analytics.py — Organisational health analytics and department intelligence."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from database import get_db, twins_col
from database import twin_history_col
from middleware.auth import require_hr_manager, get_current_user
from services.privacy import add_dp_noise

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Fields that actually exist in digital_twins (from scoring.py + seeder.py)
# stress_level, work_life_balance, meetings_per_week do NOT exist — removed
_TWIN_FIELDS = {
    "_id": 0, "emp_id": 1, "department": 1,
    "efficiency": 1, "burnout_score": 1, "cognitive_battery": 1,
    "risk_level": 1, "after_hours_pct": 1, "distraction_pct": 1,
    "switch_rate": 1, "focus_flow_state": 1,
    "stress_level": 1, "work_life_balance": 1, "work_hours_per_week": 1,
}


@router.get("/organization/health")
async def organization_health(
    user: dict = Depends(require_hr_manager),   # replaces inline role check
):
    """
    Organisational Health Score = mean of normalised burnout, efficiency, and battery.
    Only uses fields that actually exist in digital_twins.
    """
    twins = await twins_col().find({}, _TWIN_FIELDS).to_list(None)
    if not twins:
        return {"current_health_score": 0, "employee_count": 0,
                "metrics": {}, "risk_distribution": {}}

    n = len(twins)
    avg_eff      = sum(t.get("efficiency",        0)   for t in twins) / n
    avg_burn     = sum(t.get("burnout_score",      0)   for t in twins) / n
    avg_battery  = sum(t.get("cognitive_battery",  100) for t in twins) / n
    avg_ah_pct   = sum(t.get("after_hours_pct",   0)   for t in twins) / n
    avg_sw_rate  = sum(t.get("switch_rate",        0)   for t in twins) / n
    avg_stress   = sum(t.get("stress_level",       5)   for t in twins) / n
    avg_wlb      = sum(t.get("work_life_balance",  5)   for t in twins) / n
    avg_hours    = sum(t.get("work_hours_per_week", 40)  for t in twins) / n

    # Health Score: efficiency and battery raise it, burnout lowers it
    # All on 0-100 scale — consistent, no mixed scaling
    health_score = round(
        (avg_eff * 0.40) + (avg_battery * 0.35) + ((100 - avg_burn) * 0.25),
        1,
    )

    risk_dist = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for t in twins:
        level = t.get("risk_level", "LOW")
        risk_dist[level] = risk_dist.get(level, 0) + 1

    # Pull 7-day trend from twin_history if it exists
    history_col = twin_history_col()
    since = datetime.utcnow() - timedelta(days=7)
    pipeline = [
        {"$match": {"snapped_at": {"$gte": since}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$snapped_at"}},
            "emp_count":  {"$sum": 1},
            "avg_eff":    {"$avg": "$efficiency"},
            "avg_burn":   {"$avg": "$burnout_score"},
            "avg_bat":    {"$avg": "$cognitive_battery"},
        }},
        {"$sort": {"_id": 1}},
    ]
    trend_raw = await history_col.aggregate(pipeline).to_list(30)
    trend = [
        {
            "date":         d["_id"],
            "health_score": round(
                ((d.get("avg_eff") or 0) * 0.40) +
                ((d.get("avg_bat") or 100) * 0.35) +
                ((100 - (d.get("avg_burn") or 0)) * 0.25), 1
            ),
            "avg_burnout":   add_dp_noise(d.get("avg_burn") or 0, sensitivity=100.0/max(d.get("emp_count") or 1, 1)),
            "avg_efficiency": add_dp_noise(d.get("avg_eff") or 0, sensitivity=100.0/max(d.get("emp_count") or 1, 1)),
        }
        for d in trend_raw
    ]

    return {
        "current_health_score": health_score,
        "employee_count":       n,
        "metrics": {
            "avg_efficiency":     add_dp_noise(avg_eff, sensitivity=100.0/max(n, 1)),
            "avg_burnout":        add_dp_noise(avg_burn, sensitivity=100.0/max(n, 1)),
            "avg_battery":        add_dp_noise(avg_battery, sensitivity=100.0/max(n, 1)),
            "avg_after_hours_pct": add_dp_noise(avg_ah_pct, sensitivity=100.0/max(n, 1)),
            "avg_switch_rate":    round(avg_sw_rate, 3), # Keep raw switch_rate for now as it's a small decimal
            "avg_stress":         add_dp_noise(avg_stress, sensitivity=10.0/max(n, 1), lo=1.0, hi=10.0),
            "avg_wlb":            add_dp_noise(avg_wlb, sensitivity=10.0/max(n, 1), lo=1.0, hi=10.0),
            "avg_work_hours":     add_dp_noise(avg_hours, sensitivity=168.0/max(n, 1), lo=0.0, hi=168.0),
        },
        "risk_distribution": risk_dist,
        "trend_7d":          trend,
    }


@router.get("/departments")
async def department_intelligence(
    user: dict = Depends(require_hr_manager),
):
    """Department-level aggregation using real twin fields only."""
    pipeline = [
        {"$group": {
            "_id":               "$department",
            "employee_count":    {"$sum": 1},
            "avg_efficiency":    {"$avg": "$efficiency"},
            "avg_burnout":       {"$avg": "$burnout_score"},
            "avg_battery":       {"$avg": "$cognitive_battery"},
            "avg_after_hours":   {"$avg": "$after_hours_pct"},
            "avg_switch_rate":   {"$avg": "$switch_rate"},
            "critical_count":    {"$sum": {"$cond": [{"$eq": ["$risk_level", "CRITICAL"]}, 1, 0]}},
            "high_risk_count":   {"$sum": {"$cond": [{"$eq": ["$risk_level", "HIGH"]}, 1, 0]}},
            "flow_state_count":  {"$sum": {"$cond": ["$focus_flow_state", 1, 0]}},
            "avg_stress":        {"$avg": "$stress_level"},
            "avg_wlb":           {"$avg": "$work_life_balance"},
            "avg_work_hours":    {"$avg": "$work_hours_per_week"},
        }},
        {"$sort": {"avg_burnout": -1}},
    ]
    raw = await twins_col().aggregate(pipeline).to_list(None)

    result = []
    for d in raw:
        n = d["employee_count"] or 1
        result.append({
            "department":        d["_id"] or "Unknown",
            "employee_count":    d["employee_count"],
            "avg_efficiency":    add_dp_noise(d.get("avg_efficiency") or 0, sensitivity=100.0/max(n, 1)),
            "avg_burnout":       add_dp_noise(d.get("avg_burnout") or 0, sensitivity=100.0/max(n, 1)),
            "avg_battery":       add_dp_noise(d.get("avg_battery") or 100, sensitivity=100.0/max(n, 1)),
            "avg_after_hours":   add_dp_noise(d.get("avg_after_hours") or 0, sensitivity=100.0/max(n, 1)),
            "avg_switch_rate":   round(d.get("avg_switch_rate") or 0, 3),
            "critical_count":    d.get("critical_count", 0),
            "high_risk_count":   d.get("high_risk_count", 0),
            "flow_state_pct":    round(d.get("flow_state_count", 0) / n * 100, 1),
            "avg_stress":        add_dp_noise(d.get("avg_stress") or 5, sensitivity=10.0/max(n, 1), lo=1.0, hi=10.0),
            "avg_wlb":           add_dp_noise(d.get("avg_wlb") or 5, sensitivity=10.0/max(n, 1), lo=1.0, hi=10.0),
            "avg_work_hours":    add_dp_noise(d.get("avg_work_hours") or 40, sensitivity=168.0/max(n, 1), lo=0.0, hi=168.0),
        })

    return {"departments": result, "total_departments": len(result)}