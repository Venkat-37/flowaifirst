"""routes/forecast.py — Predictive burnout forecasting endpoints."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from database import activity_col, twins_col
from middleware.auth import get_current_user
from middleware.privacy import anonymize_twin_data
from services.forecasting import compute_burnout_forecast

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("/{emp_id}")
async def get_burnout_forecast(emp_id: str, user: dict = Depends(get_current_user)):
    """
    Return a 21-day burnout trajectory for one employee.
    Includes velocity, direction, 7/14/21-day score predictions, and early warning flag.
    """
    emp_id = emp_id.upper()

    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if not twin:
        raise HTTPException(404, f"No twin found for {emp_id}")

    events = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).to_list(None)

    forecast = compute_burnout_forecast(events, twin.get("burnout_score", 0))

    payload = {
        "emp_id":          emp_id,
        "current_burnout": twin.get("burnout_score", 0),
        "current_risk":    twin.get("risk_level", "LOW"),
        **forecast,
    }
    return anonymize_twin_data(payload, user.get("role"))


@router.get("/org/at-risk-trend")
async def org_risk_trend(user: dict = Depends(get_current_user)):
    """
    Organisation-wide forecast: employees where trajectory will hit HIGH or CRITICAL.
    """
    twins = await twins_col().find({}, {"_id": 0}).to_list(None)
    at_risk_trend = []

    for twin in twins:
        emp_id = twin.get("emp_id", "")
        events = await activity_col().find(
            {"emp_id": emp_id}, {"_id": 0}
        ).to_list(None)

        forecast = compute_burnout_forecast(events, twin.get("burnout_score", 0))
        if forecast.get("early_warning") or forecast.get("trend_direction") == "DETERIORATING":
            at_risk_trend.append({
                "emp_id":          emp_id,
                "department":      twin.get("department", ""),
                "current_burnout": twin.get("burnout_score", 0),
                "current_risk":    twin.get("risk_level", "LOW"),
                "velocity":        forecast["velocity"],
                "forecast_21d":    forecast["forecast_21d"],
                "risk_trajectory": forecast["risk_trajectory"],
                "early_warning":   forecast["early_warning"],
                "narrative":       forecast["narrative"],
            })

    at_risk_trend.sort(key=lambda x: x["forecast_21d"], reverse=True)
    payload = {"at_risk_trend": at_risk_trend[:20], "total_flagged": len(at_risk_trend)}
    return anonymize_twin_data(payload, user.get("role"))
