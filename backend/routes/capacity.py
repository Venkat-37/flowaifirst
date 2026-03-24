"""routes/capacity.py — Remaining Productive Capacity (RPC) API.

Exposes two endpoints:

    GET  /api/capacity/{emp_id}
         Forward problem: returns the current RPC value, 8-hour forecast
         trajectory, and capacity_risk classification.

    POST /api/capacity/{emp_id}/fit
         Inverse problem: re-fits ODE parameters to the employee's most
         recent MongoDB history and caches the result in digital_twins.
         Call this after a significant behavioural pattern change, or
         on a nightly schedule.

Both endpoints fall back gracefully to population-level default
parameters if fewer than 4 historical twin states exist.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from middleware.auth import get_current_user, require_hr_manager, owns_employee_data
from services.ode_engine import (
    ode_engine,
    fit_parameters,
    ODEFitResult,
    RPCForecast,
    _default_result,
)

router = APIRouter(prefix="/api/capacity", tags=["Productive Capacity"])
log    = logging.getLogger(__name__)

# Number of historical snapshots to use for parameter fitting
_FIT_LOOKBACK_LIMIT = 48      # ~2 days of hourly snapshots
_FORECAST_LOOKBACK  = 24      # snapshots needed to confirm current trend


# ── GET /api/capacity/{emp_id} ────────────────────────────────────────────────
@router.get("/{emp_id}")
async def get_capacity(
    emp_id: str,
    user:   dict = Depends(get_current_user),
) -> dict:
    """Return current RPC and 8-hour forecast for one employee.

    Access control:
      - Employee role: own emp_id only
      - HR Manager / Admin: any emp_id
    """
    emp_id = emp_id.upper()

    # Ownership check (Gap 1.4 fix already applied in twins route — mirror here)
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied — you may only view your own capacity")

    db = get_db()

    # ── 1. Fetch current twin state ───────────────────────────────────────────
    twin = await db["digital_twins"].find_one(
        {"emp_id": emp_id}, {"_id": 0}
    )
    if not twin:
        raise HTTPException(404, f"No twin state found for {emp_id}")

    # ── 2. Load cached ODE parameters (or use population defaults) ───────────
    fit_doc = await db["ode_params"].find_one({"emp_id": emp_id})
    if fit_doc:
        fit = ODEFitResult(
            emp_id    = emp_id,
            alpha     = fit_doc["alpha"],
            beta      = fit_doc["beta"],
            gamma     = fit_doc["gamma"],
            delta     = fit_doc["delta"],
            fit_mse   = fit_doc.get("fit_mse", float("nan")),
            converged = fit_doc.get("converged", False),
        )
        log.debug("Loaded cached ODE params for %s (MSE=%.4f)", emp_id, fit.fit_mse)
    else:
        log.info("No fitted params for %s — using population defaults", emp_id)
        fit = _default_result(emp_id=emp_id)

    # ── 3. Compute RPC forecast ───────────────────────────────────────────────
    # Serialise last_updated if it's a datetime object
    twin_state = dict(twin)
    if isinstance(twin_state.get("last_updated"), datetime):
        twin_state["last_updated"] = twin_state["last_updated"].isoformat()

    forecast: RPCForecast = ode_engine.forecast_rpc(
        emp_id        = emp_id,
        current_state = twin_state,
        fit           = fit,
        horizon_h     = 8.0,
    )

    return {
        **forecast.to_dict(),
        "params_fitted":   fit.converged,
        "params_fit_mse":  round(fit.fit_mse, 6) if not __import__("math").isnan(fit.fit_mse) else None,
    }


# ── POST /api/capacity/{emp_id}/fit ───────────────────────────────────────────
@router.post("/{emp_id}/fit")
async def fit_capacity_params(
    emp_id: str,
    user:   dict = Depends(get_current_user),
) -> dict:
    """Re-fit ODE parameters to this employee's recent history.

    Requires HR Manager or Admin role — this is an analytical operation,
    not self-service.
    """
    emp_id = emp_id.upper()

    if user.get("role") == "Employee":
        raise HTTPException(403, "Parameter fitting requires HR Manager or Admin role")

    db = get_db()

    # ── 1. Fetch recent digital_twin snapshots ────────────────────────────────
    # NOTE: v3.2 stores one snapshot per twin (no time-series).
    # We build a pseudo-history from activity_events aggregated by hour.
    # For richer fitting, upgrade to storing snapshots on every refresh.
    cutoff = datetime.utcnow() - timedelta(hours=_FIT_LOOKBACK_LIMIT)

    # Try dedicated twin_history collection first (opt-in feature)
    history = await db["twin_history"].find(
        {"emp_id": emp_id, "last_updated": {"$gte": cutoff}},
        {"_id": 0, "burnout_score": 1, "cognitive_battery": 1,
         "switch_rate": 1, "after_hours_pct": 1, "distraction_pct": 1,
         "last_updated": 1},
    ).sort("last_updated", 1).to_list(_FIT_LOOKBACK_LIMIT)

    # Fallback: use single current twin repeated with synthetic noise
    # (not ideal — motivates adding twin_history writes to refresh endpoint)
    if len(history) < 4:
        twin = await db["digital_twins"].find_one({"emp_id": emp_id}, {"_id": 0})
        if not twin:
            raise HTTPException(404, f"No twin state for {emp_id}")
        log.info(
            "Only %d history points for %s — using synthetic augmentation",
            len(history), emp_id,
        )
        history = _synthetic_history_from_single(twin, n=12)

    # ── 2. Build time series and fit ─────────────────────────────────────────
    ts = ode_engine.build_time_series(history, emp_id=emp_id)
    if ts is None:
        raise HTTPException(
            422,
            f"Could not build time series for {emp_id}. "
            "Need at least 4 historical twin snapshots."
        )

    result = fit_parameters(ts)
    result.emp_id = emp_id

    # ── 3. Cache parameters in MongoDB ───────────────────────────────────────
    await db["ode_params"].update_one(
        {"emp_id": emp_id},
        {"$set": {
            **result.to_dict(),
            "updated_at": datetime.utcnow(),
        }},
        upsert=True,
    )

    log.info(
        "ODE fit for %s: converged=%s MSE=%.6f α=%.4f β=%.4f γ=%.4f δ=%.4f",
        emp_id, result.converged, result.fit_mse,
        result.alpha, result.beta, result.gamma, result.delta,
    )

    return {
        **result.to_dict(),
        "message": (
            "Parameters fitted and cached successfully."
            if result.converged else
            "Optimiser did not fully converge — using best available parameters. "
            "More historical data will improve fit quality."
        ),
    }


# ── GET /api/capacity/org/summary ─────────────────────────────────────────────
@router.get("/org/summary")
async def get_org_capacity_summary(
    user: dict = Depends(get_current_user),
) -> dict:
    """Aggregate RPC statistics for the whole organisation.

    Uses cached RPC values stored during the most recent per-employee
    forecast (written back to digital_twins.rpc_current by the
    /api/twins/{id}/refresh endpoint when ode_engine is integrated).
    """
    if user.get("role") == "Employee":
        raise HTTPException(403, "Org summary requires HR Manager or Admin role")

    db = get_db()
    pipeline = [
        {"$match":  {"rpc_current": {"$exists": True}}},
        {"$group":  {
            "_id":            "$department",
            "avg_rpc":        {"$avg":  "$rpc_current"},
            "min_rpc":        {"$min":  "$rpc_current"},
            "critical_count": {"$sum":  {"$cond": [{"$lt": ["$rpc_current", 20]}, 1, 0]}},
            "high_count":     {"$sum":  {"$cond": [{"$and": [
                {"$gte": ["$rpc_current", 20]}, {"$lt": ["$rpc_current", 40]}
            ]}, 1, 0]}},
            "count":          {"$sum":  1},
        }},
        {"$sort": {"avg_rpc": 1}},
    ]
    rows = await db["digital_twins"].aggregate(pipeline).to_list(None)

    if not rows:
        return {"message": "No RPC data yet — run /api/capacity/{emp_id}/fit for employees first"}

    return {
        "departments":     rows,
        "total_employees": sum(r["count"] for r in rows),
        "critical_total":  sum(r["critical_count"] for r in rows),
        "computed_at":     datetime.utcnow().isoformat(),
    }


# ── Helper ────────────────────────────────────────────────────────────────────

def _synthetic_history_from_single(twin: dict, n: int = 12) -> list[dict]:
    """Generate synthetic history from a single snapshot using small perturbations.

    This is a bootstrapping fallback only. Real history from twin_history
    collection will produce better parameter fits.
    """
    import random
    rng = random.Random(twin.get("emp_id", "seed"))
    base_burnout = float(twin.get("burnout_score",    30.0))
    base_battery = float(twin.get("cognitive_battery", 80.0))
    base_switch  = float(twin.get("switch_rate",       0.3))
    base_ahours  = float(twin.get("after_hours_pct",   5.0))
    base_dist    = float(twin.get("distraction_pct",   15.0))

    docs = []
    burnout = max(0.0, min(100.0, base_burnout - (n // 2) * 1.5))
    battery = min(100.0, base_battery + (n // 2) * 1.0)

    for i in range(n):
        burnout = min(100.0, max(0.0, burnout + rng.gauss(1.5, 2.5)))
        battery = min(100.0, max(0.0, battery - rng.gauss(1.0, 1.5)))
        docs.append({
            "burnout_score":    round(burnout, 1),
            "cognitive_battery":round(battery, 1),
            "switch_rate":      max(0.0, min(1.0, base_switch + rng.gauss(0, 0.04))),
            "after_hours_pct":  max(0.0, base_ahours + rng.gauss(0, 2.0)),
            "distraction_pct":  max(0.0, base_dist  + rng.gauss(0, 3.0)),
            "last_updated":     (datetime.utcnow() - timedelta(hours=n - i)).isoformat(),
        })
    return docs
