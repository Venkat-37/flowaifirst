"""services/ode_engine.py — Demand-Recovery ODE Engine.

Two-state coupled ODE system for modelling cognitive fatigue dynamics:

    dE/dt = α·u(t)·(1−E) − β·r(t)·E        [Fatigue accumulation]
    dC/dt = γ·(1−C)·r(t) − δ·u(t)·C         [Recovery dynamics]

Where:
    E(t) ∈ [0,1]  — Fatigue Load (normalised burnout)
    C(t) ∈ [0,1]  — Recovery Capacity (normalised cognitive battery)
    u(t)           — Demand signal, derived from scoring.py fields
    r(t) = 1−u(t) — Recovery signal (complement of demand)

Output:
    RPC(t) = 100 · C(t) · (1 − E(t))   — Remaining Productive Capacity

Forward Problem: given known parameters [α, β, γ, δ] and initial state,
  solve the ODE to produce a forecast trajectory.

Inverse Problem: given a historical time-series of (burnout_score,
  cognitive_battery, switch_rate, ...) from MongoDB digital_twins,
  identify the optimal [α, β, γ, δ] for that specific employee.
  This is online model calibration — parameters adapt to individual
  recovery rates rather than relying on a generic population assumption.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import minimize, OptimizeResult

log = logging.getLogger(__name__)

# ── Parameter bounds — physiologically motivated ──────────────────────────────
#   All rates must be positive; upper bounds prevent degenerate oscillation.
_PARAM_BOUNDS = [
    (0.01, 2.0),   # α — demand accumulation rate
    (0.01, 2.0),   # β — fatigue clearance rate
    (0.01, 1.5),   # γ — natural recovery rate
    (0.01, 2.0),   # δ — demand-induced depletion rate
]

# Default population-level initial guesses (used before per-employee fitting)
_DEFAULT_PARAMS = np.array([0.30, 0.20, 0.15, 0.25], dtype=np.float64)


# ── Data container ────────────────────────────────────────────────────────────

@dataclass
class EmployeeTimeSeries:
    """Historical twin state snapshots prepared for ODE fitting.

    Fields are normalised to [0, 1] before fitting.
    """
    t:            np.ndarray   # time points (hours from first observation)
    u:            np.ndarray   # demand signal at each t
    E_observed:   np.ndarray   # normalised burnout_score / 100
    C_observed:   np.ndarray   # normalised cognitive_battery / 100
    E0:           float        # initial fatigue load
    C0:           float        # initial recovery capacity


@dataclass
class ODEFitResult:
    """Output of the inverse problem (parameter identification)."""
    emp_id:        str
    alpha:         float
    beta:          float
    gamma:         float
    delta:         float
    fit_mse:       float        # mean squared error of fit
    converged:     bool
    fitted_at:     datetime = field(default_factory=datetime.utcnow)

    @property
    def params(self) -> np.ndarray:
        return np.array([self.alpha, self.beta, self.gamma, self.delta])

    def to_dict(self) -> dict:
        return {
            "emp_id":     self.emp_id,
            "alpha":      round(self.alpha, 4),
            "beta":       round(self.beta, 4),
            "gamma":      round(self.gamma, 4),
            "delta":      round(self.delta, 4),
            "fit_mse":    round(self.fit_mse, 6),
            "converged":  self.converged,
            "fitted_at":  self.fitted_at.isoformat(),
        }


@dataclass
class RPCForecast:
    """Forward-problem output: RPC trajectory over a future horizon."""
    emp_id:          str
    current_rpc:     float       # RPC right now (0–100)
    rpc_1h:          float       # predicted RPC in 1 hour
    rpc_4h:          float       # predicted RPC in 4 hours
    rpc_8h:          float       # predicted RPC in 8 hours (end of workday)
    rpc_trajectory:  list[float] # full trajectory (1 point per 15 minutes)
    t_hours:         list[float] # corresponding time axis
    capacity_risk:   str         # LOW | MEDIUM | HIGH | CRITICAL
    narrative:       str

    def to_dict(self) -> dict:
        return {
            "emp_id":         self.emp_id,
            "current_rpc":    round(self.current_rpc, 1),
            "rpc_1h":         round(self.rpc_1h, 1),
            "rpc_4h":         round(self.rpc_4h, 1),
            "rpc_8h":         round(self.rpc_8h, 1),
            "rpc_trajectory": [round(v, 1) for v in self.rpc_trajectory],
            "t_hours":        [round(v, 2) for v in self.t_hours],
            "capacity_risk":  self.capacity_risk,
            "narrative":      self.narrative,
        }


# ── Demand signal ─────────────────────────────────────────────────────────────

def build_demand_signal(
    switch_rate:      float,   # 0–1  from scoring.py
    after_hours_pct:  float,   # 0–100
    distraction_pct:  float,   # 0–100
) -> float:
    """Construct the scalar demand signal u(t) ∈ [0, 1].

    Weights mirror the MBI Emotional Exhaustion sub-formula
    (context switching is the dominant predictor per Rosen 2011).

        u = 0.40·switch_rate + 0.35·(after_hours/100) + 0.25·(distraction/100)

    The complement r(t) = 1 − u(t) is the recovery signal.
    """
    u = (
        0.40 * np.clip(switch_rate,               0.0, 1.0) +
        0.35 * np.clip(after_hours_pct / 100.0,   0.0, 1.0) +
        0.25 * np.clip(distraction_pct / 100.0,   0.0, 1.0)
    )
    return float(np.clip(u, 0.0, 1.0))


# ── ODE system ────────────────────────────────────────────────────────────────

def _ode_system(
    t:      float,
    state:  list[float],
    params: np.ndarray,
    u_func,                   # callable: t → demand signal u(t)
) -> list[float]:
    """RHS of the coupled ODE system.

        dE/dt = α·u·(1−E) − β·(1−u)·E
        dC/dt = γ·(1−C)·(1−u) − δ·u·C

    Saturation terms (1−E) and (1−C) enforce biological boundedness:
    fatigue cannot exceed 1, recovery cannot exceed 1.
    """
    E, C = state
    alpha, beta, gamma, delta = params
    u = np.clip(u_func(t), 0.0, 1.0)
    r = 1.0 - u

    # Clamp state to [0, 1] to prevent numerical drift
    E = np.clip(E, 0.0, 1.0)
    C = np.clip(C, 0.0, 1.0)

    dE_dt = alpha * u * (1.0 - E) - beta * r * E
    dC_dt = gamma * (1.0 - C) * r - delta * u * C

    return [dE_dt, dC_dt]


def _rpc(E: np.ndarray, C: np.ndarray) -> np.ndarray:
    """Remaining Productive Capacity: RPC = 100 · C · (1 − E)."""
    return 100.0 * np.clip(C, 0.0, 1.0) * (1.0 - np.clip(E, 0.0, 1.0))


# ── Forward solver ────────────────────────────────────────────────────────────

def solve_forward(
    E0:       float,
    C0:       float,
    params:   np.ndarray,
    u_func,
    t_span:   tuple[float, float],
    n_points: int = 33,         # one per 15 minutes over 8 hours = 33
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Solve the ODE forward in time and return E, C, RPC trajectories.

    Returns:
        t      — time axis (hours)
        EC     — state matrix [n_points × 2]
        rpc    — Remaining Productive Capacity trajectory
    """
    t_eval = np.linspace(t_span[0], t_span[1], n_points)
    sol = solve_ivp(
        fun        = lambda t, y: _ode_system(t, y, params, u_func),
        t_span     = t_span,
        y0         = [E0, C0],
        t_eval     = t_eval,
        method     = "RK45",
        rtol       = 1e-4,
        atol       = 1e-6,
        max_step   = 0.25,         # 15-minute max integration step
    )
    if not sol.success:
        log.warning("ODE solver warning: %s", sol.message)

    E   = np.clip(sol.y[0], 0.0, 1.0)
    C   = np.clip(sol.y[1], 0.0, 1.0)
    rpc = _rpc(E, C)
    return sol.t, np.stack([E, C], axis=1), rpc


# ── Inverse problem (parameter fitting) ──────────────────────────────────────

def fit_parameters(ts: EmployeeTimeSeries) -> ODEFitResult:
    """Identify [α, β, γ, δ] that best reproduce the observed time-series.

    Loss function: weighted MSE between ODE-predicted E(t), C(t) and
    the observed normalised burnout_score, cognitive_battery series.

    The fatigue trajectory (E) is weighted 2× the recovery trajectory (C)
    because the MBI literature treats exhaustion as the primary indicator.
    """
    if len(ts.t) < 4:
        log.warning("Insufficient data for ODE fitting (%d points)", len(ts.t))
        return _default_result(emp_id="unknown")

    # Pre-build a piecewise-linear demand interpolator from the observed series
    u_interp = _build_u_interpolator(ts.t, ts.u)

    def loss(params: np.ndarray) -> float:
        params = np.abs(params)   # enforce positivity
        try:
            t_eval = ts.t
            sol = solve_ivp(
                fun      = lambda t, y: _ode_system(t, y, params, u_interp),
                t_span   = (ts.t[0], ts.t[-1]),
                y0       = [ts.E0, ts.C0],
                t_eval   = t_eval,
                method   = "RK45",
                rtol     = 1e-3,
                atol     = 1e-5,
                max_step = 1.0,
            )
            if not sol.success or sol.y.shape[1] != len(t_eval):
                return 1e6

            E_pred = np.clip(sol.y[0], 0.0, 1.0)
            C_pred = np.clip(sol.y[1], 0.0, 1.0)

            # Weighted MSE: EE twice as important as Recovery
            mse_E = np.mean((E_pred - ts.E_observed) ** 2)
            mse_C = np.mean((C_pred - ts.C_observed) ** 2)
            return 2.0 * mse_E + 1.0 * mse_C

        except Exception:
            return 1e6

    result: OptimizeResult = minimize(
        fun     = loss,
        x0      = _DEFAULT_PARAMS,
        method  = "L-BFGS-B",
        bounds  = _PARAM_BOUNDS,
        options = {"maxiter": 500, "ftol": 1e-9},
    )

    p = np.abs(result.x)
    return ODEFitResult(
        emp_id    = "unknown",   # caller sets this
        alpha     = float(p[0]),
        beta      = float(p[1]),
        gamma     = float(p[2]),
        delta     = float(p[3]),
        fit_mse   = float(result.fun),
        converged = bool(result.success),
    )


def _build_u_interpolator(t: np.ndarray, u: np.ndarray):
    """Return a callable that linearly interpolates u between observed points."""
    def u_func(t_query: float) -> float:
        return float(np.interp(t_query, t, u))
    return u_func


def _default_result(emp_id: str) -> ODEFitResult:
    return ODEFitResult(
        emp_id    = emp_id,
        alpha     = _DEFAULT_PARAMS[0],
        beta      = _DEFAULT_PARAMS[1],
        gamma     = _DEFAULT_PARAMS[2],
        delta     = _DEFAULT_PARAMS[3],
        fit_mse   = float("nan"),
        converged = False,
    )


# ── High-level API ────────────────────────────────────────────────────────────

class ODECapacityEngine:
    """Stateless service facade. Inject into FastAPI routes.

    Typical call sequence:
        1. build_time_series(history)           — prepare MongoDB data
        2. fit_parameters(ts)                   — inverse problem per employee
        3. forecast_rpc(current_state, result)  — forward problem → RPC
    """

    @staticmethod
    def build_time_series(
        history:  list[dict],
        emp_id:   str = "unknown",
    ) -> EmployeeTimeSeries | None:
        """Convert MongoDB digital_twin history docs → EmployeeTimeSeries.

        Each doc is expected to have:
            burnout_score, cognitive_battery,
            switch_rate, after_hours_pct, distraction_pct,
            last_updated (ISO datetime string or datetime object)
        """
        if len(history) < 4:
            log.debug("ODE: not enough history for %s (%d points)", emp_id, len(history))
            return None

        # Sort chronologically
        def _ts(doc) -> datetime:
            lu = doc.get("last_updated")
            if isinstance(lu, datetime):
                return lu
            if isinstance(lu, str):
                try:
                    return datetime.fromisoformat(lu.replace("Z", "+00:00"))
                except ValueError:
                    pass
            return datetime.utcnow()

        docs = sorted(history, key=_ts)
        t0   = _ts(docs[0])

        t_arr = np.array([
            (_ts(d) - t0).total_seconds() / 3600.0   # convert to hours
            for d in docs
        ], dtype=np.float64)

        u_arr = np.array([
            build_demand_signal(
                switch_rate     = float(d.get("switch_rate",      0.0)),
                after_hours_pct = float(d.get("after_hours_pct",  0.0)),
                distraction_pct = float(d.get("distraction_pct",  0.0)),
            )
            for d in docs
        ], dtype=np.float64)

        E_obs = np.array(
            [float(d.get("burnout_score",    0.0)) / 100.0 for d in docs],
            dtype=np.float64,
        )
        C_obs = np.array(
            [float(d.get("cognitive_battery", 100.0)) / 100.0 for d in docs],
            dtype=np.float64,
        )

        return EmployeeTimeSeries(
            t          = t_arr,
            u          = u_arr,
            E_observed = np.clip(E_obs, 0.0, 1.0),
            C_observed = np.clip(C_obs, 0.0, 1.0),
            E0         = float(np.clip(E_obs[0],  0.0, 1.0)),
            C0         = float(np.clip(C_obs[0],  0.0, 1.0)),
        )

    @staticmethod
    def forecast_rpc(
        emp_id:        str,
        current_state: dict,
        fit:           ODEFitResult,
        horizon_h:     float = 8.0,
    ) -> RPCForecast:
        """Solve the ODE forward from the current twin state.

        current_state must contain:
            burnout_score, cognitive_battery,
            switch_rate, after_hours_pct, distraction_pct
        """
        E0  = np.clip(current_state.get("burnout_score",    0.0) / 100.0, 0.0, 1.0)
        C0  = np.clip(current_state.get("cognitive_battery", 100.0) / 100.0, 0.0, 1.0)
        u_now = build_demand_signal(
            switch_rate     = float(current_state.get("switch_rate",      0.0)),
            after_hours_pct = float(current_state.get("after_hours_pct",  0.0)),
            distraction_pct = float(current_state.get("distraction_pct",  0.0)),
        )

        # Constant demand signal for the forecast horizon (can extend to
        # schedule-aware piecewise signal in a future version)
        u_const = lambda t: u_now

        n_pts  = int(horizon_h * 4) + 1    # one point per 15 minutes
        t_axis, _, rpc_traj = solve_forward(
            E0       = E0,
            C0       = C0,
            params   = fit.params,
            u_func   = u_const,
            t_span   = (0.0, horizon_h),
            n_points = n_pts,
        )

        def _rpc_at(target_h: float) -> float:
            idx = np.argmin(np.abs(t_axis - target_h))
            return float(rpc_traj[idx])

        current_rpc = float(_rpc(np.array([E0]), np.array([C0]))[0])
        rpc_1h  = _rpc_at(1.0)
        rpc_4h  = _rpc_at(4.0)
        rpc_8h  = _rpc_at(min(8.0, horizon_h))

        risk = (
            "CRITICAL" if current_rpc < 20 else
            "HIGH"     if current_rpc < 40 else
            "MEDIUM"   if current_rpc < 60 else
            "LOW"
        )

        narrative = _build_narrative(current_rpc, rpc_4h, rpc_8h, risk, u_now)

        return RPCForecast(
            emp_id         = emp_id,
            current_rpc    = current_rpc,
            rpc_1h         = rpc_1h,
            rpc_4h         = rpc_4h,
            rpc_8h         = rpc_8h,
            rpc_trajectory = rpc_traj.tolist(),
            t_hours        = t_axis.tolist(),
            capacity_risk  = risk,
            narrative      = narrative,
        )


def _build_narrative(
    rpc_now: float,
    rpc_4h:  float,
    rpc_8h:  float,
    risk:    str,
    u_now:   float,
) -> str:
    direction = "declining" if rpc_8h < rpc_now - 5 else (
                "recovering" if rpc_8h > rpc_now + 5 else "stable")
    return (
        f"Current productive capacity is {rpc_now:.0f}/100 ({risk} risk). "
        f"At current demand load ({u_now:.0%}), capacity is {direction} — "
        f"projected at {rpc_4h:.0f}/100 in 4 hours and {rpc_8h:.0f}/100 "
        f"by end of workday. "
        + (
            "Recovery intervention recommended before capacity drops below 20."
            if risk in ("CRITICAL", "HIGH") else
            "No immediate intervention required."
        )
    )


# Module-level singleton
ode_engine = ODECapacityEngine()
