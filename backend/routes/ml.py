# routes/ml.py — complete, wired to real services
"""routes/ml.py — Predictive ML: anomaly detection + burnout forecast."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from database import twins_col, activity_col
from middleware.auth import get_current_user, require_hr_manager, owns_employee_data
from services.forecasting import compute_burnout_forecast
from services.ml_anomaly import detect_anomalies
from services.ode_engine import ode_engine, _default_result

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/{emp_id}/predictive-profile")
async def predictive_profile(emp_id: str, user: dict = Depends(get_current_user)):
    """Anomaly detection + burnout forecast for one employee."""
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")

    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if not twin:
        raise HTTPException(404, f"No twin for {emp_id}")

    # Anomaly via Isolation Forest
    try:
        anomaly = await detect_anomalies(emp_id)
    except Exception as e:
        anomaly = {"anomaly_detected": False, "error": str(e)}

    # RPC capacity via ODE engine
    try:
        fit_doc = await twins_col().database["ode_params"].find_one({"emp_id": emp_id})
        if fit_doc:
            from services.ode_engine import ODEFitResult
            fit = ODEFitResult(emp_id=emp_id, alpha=fit_doc["alpha"],
                               beta=fit_doc["beta"], gamma=fit_doc["gamma"],
                               delta=fit_doc["delta"],
                               fit_mse=fit_doc.get("fit_mse", float("nan")),
                               converged=fit_doc.get("converged", False))
        else:
            fit = _default_result(emp_id)
        rpc = ode_engine.forecast_rpc(emp_id, twin, fit, horizon_h=8.0)
        capacity = {"current_rpc": rpc.current_rpc, "rpc_8h": rpc.rpc_8h,
                    "capacity_risk": rpc.capacity_risk, "narrative": rpc.narrative}
    except Exception as e:
        capacity = {"error": str(e)}

    # 21-day burnout forecast
    try:
        events = await activity_col().find(
            {"emp_id": emp_id}, {"_id": 0}
        ).sort("timestamp", -1).limit(500).to_list(500)
        forecast = compute_burnout_forecast(events, float(twin.get("burnout_score", 0)))
    except Exception as e:
        forecast = {"error": str(e)}

    return {"emp_id": emp_id, "anomaly": anomaly,
            "capacity": capacity, "burnout_forecast": forecast}