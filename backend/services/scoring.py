"""services/scoring.py — Burnout, efficiency, and cognitive battery algorithms."""
from __future__ import annotations
from datetime import datetime


PRODUCTIVE_CATS = {"productive", "productive (contextual)"}


def compute_stats(events: list[dict]) -> dict:
    """
    Compute all metrics from a list of activity event dicts.
    Each event has: emp_id, timestamp, app_name, category, department.
    """
    if not events:
        return _empty_stats()

    total = len(events)
    productive = sum(1 for e in events if e.get("category", "").lower() in PRODUCTIVE_CATS)
    distraction = sum(1 for e in events if e.get("category", "").lower() == "distraction")
    neutral = total - productive - distraction

    # After-hours: before 9am or after 7pm
    after_hours = sum(
        1 for e in events
        if _is_after_hours(_parse_ts(e.get("timestamp")))
    )

    # Context switching: category changes per event ratio
    categories = [e.get("category", "") for e in events]
    switches = sum(1 for i in range(1, len(categories)) if categories[i] != categories[i - 1])
    switch_rate = switches / max(total - 1, 1)  # 0-1

    # Average consecutive productive block length
    focus_blocks, cur = [], 0
    for cat in categories:
        if cat.lower() in PRODUCTIVE_CATS:
            cur += 1
        else:
            if cur > 0:
                focus_blocks.append(cur)
            cur = 0
    if cur > 0:
        focus_blocks.append(cur)
    avg_focus = sum(focus_blocks) / max(len(focus_blocks), 1)

    efficiency = round((productive / total) * 100, 1)
    distraction_pct = round((distraction / total) * 100, 1)
    after_hours_pct = round((after_hours / total) * 100, 1)

    # Burnout score (0-100): higher = worse
    burnout = _compute_burnout(
        after_hours_pct=after_hours_pct,
        distraction_pct=distraction_pct,
        switch_rate=switch_rate,
        avg_focus=avg_focus,
        efficiency=efficiency,
    )

    cognitive_battery = round(max(100 - burnout * 0.75, 0), 1)
    risk = _risk_level(burnout)

    return {
        "efficiency":          efficiency,
        "burnout_score":       round(burnout, 1),
        "cognitive_battery":   cognitive_battery,
        "risk_level":          risk,
        "total_events":        total,
        "productive_events":   productive,
        "distraction_events":  distraction,
        "neutral_events":      neutral,
        "after_hours_events":  after_hours,
        "focus_flow_state":    avg_focus >= 5 and switch_rate < 0.3,
        "distraction_pct":     distraction_pct,
        "after_hours_pct":     after_hours_pct,
        "switch_rate":         round(switch_rate, 3),
    }


def _compute_burnout(
    after_hours_pct: float,
    distraction_pct: float,
    switch_rate: float,
    avg_focus: float,
    efficiency: float,
) -> float:
    """Weighted burnout score 0-100."""
    score = 0.0
    score += (after_hours_pct / 100) * 30     # after-hours penalty (max 30)
    score += (distraction_pct / 100) * 25     # distraction penalty (max 25)
    score += switch_rate * 25                  # context-switch penalty (max 25)
    score += max((5 - avg_focus) / 5, 0) * 10 # short focus blocks (max 10)
    score += max((50 - efficiency) / 50, 0) * 10  # low efficiency (max 10)
    return min(score, 100.0)


def _risk_level(burnout: float) -> str:
    if burnout >= 75: return "CRITICAL"
    if burnout >= 55: return "HIGH"
    if burnout >= 35: return "MEDIUM"
    return "LOW"


def _is_after_hours(ts: datetime | None) -> bool:
    if ts is None:
        return False
    return ts.hour < 9 or ts.hour >= 19


def _parse_ts(ts) -> datetime | None:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts
    try:
        return datetime.fromisoformat(str(ts).replace("Z", ""))
    except Exception:
        return None


def _empty_stats() -> dict:
    return {
        "efficiency": 0.0, "burnout_score": 0.0, "cognitive_battery": 100.0,
        "risk_level": "LOW", "total_events": 0, "productive_events": 0,
        "distraction_events": 0, "neutral_events": 0, "after_hours_events": 0,
        "focus_flow_state": False, "distraction_pct": 0.0,
        "after_hours_pct": 0.0, "switch_rate": 0.0,
    }
