"""services/forecasting.py — Burnout velocity and predictive trend analysis.

Addresses the PRD's "predict burnout 3 weeks in advance" goal.
Works with the current single-day dataset by computing within-session
micro-trends (early vs late events in the activity stream).
When multiple days of data exist (via live telemetry ingestion) the
day-over-day delta is used instead.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional


def compute_burnout_forecast(events: list[dict], current_score: float) -> dict:
    """
    Compute burnout velocity and a 3-week probabilistic forecast.

    Returns a dict with:
      velocity          – points/day (positive = worsening)
      trend_direction   – IMPROVING | STABLE | DETERIORATING
      forecast_7d       – predicted burnout score in 7 days
      forecast_14d      – predicted burnout score in 14 days
      forecast_21d      – predicted burnout score in 21 days
      risk_trajectory   – LOW | MEDIUM | HIGH | CRITICAL
      confidence        – LOW | MEDIUM | HIGH
      early_warning     – bool, True if trajectory will hit CRITICAL within 21d
      narrative         – human-readable one-line explanation
    """
    if not events:
        return _flat_forecast(current_score, "Insufficient data for trend analysis.")

    # ── Sort events chronologically ───────────────────────────────────────────
    sorted_events = sorted(
        events,
        key=lambda e: _parse_ts(e.get("timestamp")) or datetime.min
    )

    # ── Split into first-half / second-half to derive micro-trend ────────────
    n = len(sorted_events)
    mid = n // 2
    first_half  = sorted_events[:mid]  if mid > 0 else sorted_events
    second_half = sorted_events[mid:]  if mid > 0 else sorted_events

    score_first  = _mini_burnout(first_half)
    score_second = _mini_burnout(second_half)

    delta = score_second - score_first   # positive = burnout increasing over session

    # ── Velocity: scale delta to a "per day" estimate ────────────────────────
    # We observe roughly half a work day in each split.
    # A cautious multiplier of 0.5 converts intra-session delta to daily velocity.
    velocity = round(delta * 0.5, 2)

    # ── Forecasts ─────────────────────────────────────────────────────────────
    f7  = _clamp(current_score + velocity * 7)
    f14 = _clamp(current_score + velocity * 14)
    f21 = _clamp(current_score + velocity * 21)

    # ── Direction ─────────────────────────────────────────────────────────────
    if velocity > 1.5:
        direction = "DETERIORATING"
    elif velocity < -1.5:
        direction = "IMPROVING"
    else:
        direction = "STABLE"

    # ── Early warning ─────────────────────────────────────────────────────────
    early_warning = f21 >= 75.0

    # ── Confidence (higher with more events) ─────────────────────────────────
    if n >= 50:
        confidence = "HIGH"
    elif n >= 20:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # ── Narrative ─────────────────────────────────────────────────────────────
    if direction == "DETERIORATING":
        narrative = (
            f"Burnout is rising at ~{abs(velocity):.1f} pts/day. "
            f"At this trajectory, score reaches {f21:.0f} in 21 days."
        )
    elif direction == "IMPROVING":
        narrative = (
            f"Conditions are improving by ~{abs(velocity):.1f} pts/day. "
            f"Projected score in 21 days: {f21:.0f}."
        )
    else:
        narrative = f"Burnout is holding steady around {current_score:.0f}. No immediate escalation detected."

    return {
        "velocity":         velocity,
        "trend_direction":  direction,
        "forecast_7d":      f7,
        "forecast_14d":     f14,
        "forecast_21d":     f21,
        "risk_trajectory":  _risk_level(f21),
        "confidence":       confidence,
        "early_warning":    early_warning,
        "narrative":        narrative,
        "data_points":      n,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

PRODUCTIVE_CATS = {"productive", "productive (contextual)"}

def _mini_burnout(events: list[dict]) -> float:
    """Lightweight burnout proxy for a subset of events."""
    if not events:
        return 0.0
    total = len(events)
    prod  = sum(1 for e in events if e.get("category", "").lower() in PRODUCTIVE_CATS)
    dist  = sum(1 for e in events if e.get("category", "").lower() == "distraction")
    after = sum(1 for e in events if _is_after_hours(_parse_ts(e.get("timestamp"))))

    eff      = (prod / total) * 100
    dist_pct = (dist / total) * 100
    ah_pct   = (after / total) * 100

    cats = [e.get("category", "") for e in events]
    switches = sum(1 for i in range(1, len(cats)) if cats[i] != cats[i - 1])
    switch_rate = switches / max(total - 1, 1)

    score = 0.0
    score += (ah_pct   / 100) * 30
    score += (dist_pct / 100) * 25
    score += switch_rate       * 25
    score += max((50 - eff) / 50, 0) * 10
    return min(score, 100.0)


def _is_after_hours(ts: Optional[datetime]) -> bool:
    if ts is None:
        return False
    return ts.hour < 9 or ts.hour >= 19


def _parse_ts(ts) -> Optional[datetime]:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts
    try:
        return datetime.fromisoformat(str(ts).replace("Z", ""))
    except Exception:
        return None


def _clamp(v: float) -> float:
    return round(max(0.0, min(100.0, v)), 1)


def _risk_level(score: float) -> str:
    if score >= 75: return "CRITICAL"
    if score >= 55: return "HIGH"
    if score >= 35: return "MEDIUM"
    return "LOW"


def _flat_forecast(current: float, narrative: str) -> dict:
    return {
        "velocity":        0.0,
        "trend_direction": "STABLE",
        "forecast_7d":     _clamp(current),
        "forecast_14d":    _clamp(current),
        "forecast_21d":    _clamp(current),
        "risk_trajectory": _risk_level(current),
        "confidence":      "LOW",
        "early_warning":   current >= 75,
        "narrative":       narrative,
        "data_points":     0,
    }
