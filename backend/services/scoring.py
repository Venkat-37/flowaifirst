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

    # NEW: Idle-adjusted productive time
    # Any event with idle_minutes > 5 is excluded from focus scoring
    active_events = [
        e for e in events
        if e.get("idle_minutes", 0) <= 5
    ]
    
    # Recalculate focus blocks on ACTIVE events only
    active_cats = [e.get("category", "") for e in active_events]
    focus_blocks, cur = [], 0
    for cat in active_cats:
        if cat.lower() in PRODUCTIVE_CATS:
            cur += 1
        else:
            if cur > 0:
                focus_blocks.append(cur)
            cur = 0
    if cur > 0:
        focus_blocks.append(cur)
    avg_focus = sum(focus_blocks) / max(len(focus_blocks), 1)
    
    # Deep Work Units: contiguous productive periods longer than 10 events (1 unit per 10 items)
    deep_work_units = sum(b // 10 for b in focus_blocks)

    efficiency = round((productive / total) * 100, 1)
    distraction_pct = round((distraction / total) * 100, 1)
    after_hours_pct = round((after_hours / total) * 100, 1)

    # NEW Gaming Defenses: Entropy, Temporal, Idle
    title_entropy = _window_title_entropy(events)
    temporal_consistency = _temporal_consistency_score(events)
    idle_ratio = 1 - (len(active_events) / max(total, 1))
    
    # Low entropy penalises the focus score
    # Genuine deep work: entropy > 0.6 | Single-app gaming: entropy < 0.2
    entropy_multiplier = max(title_entropy, 0.3)  # floor at 0.3
    avg_focus = avg_focus * entropy_multiplier

    focus_flow_state = avg_focus >= 3 and switch_rate < 0.45

    if switch_rate > 0.8:
        efficiency = 0.0
        avg_focus = 0.0
        focus_flow_state = False

    # Burnout score (0-100): higher = worse
    idle_minutes = events[0].get("idle_minutes", 0.0) if events else 0.0
    
    after_hours_weighted = sum(_after_hours_severity(_parse_ts(e.get("timestamp"))) for e in events) / max(total, 1)
    
    burnout = _compute_burnout(
        after_hours_pct=after_hours_weighted * 100,
        distraction_pct=distraction_pct,
        switch_rate=switch_rate,
        avg_focus=avg_focus,
        efficiency=efficiency,
        idle_minutes=idle_minutes,
    )

    # Idle ratio — what fraction of session was idle
    idle_ratio = 1 - (len(active_events) / max(total, 1))
    
    # Penalise: high idle_ratio with high claimed efficiency = suspicious
    idle_penalty = idle_ratio * 20  # up to 20 pts burnout penalty for high idle
    burnout = min(burnout + idle_penalty, 100.0)

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
        "focus_flow_state":    focus_flow_state,
        "focus_streak":        round(avg_focus, 1),
        "distraction_pct":     distraction_pct,
        "after_hours_pct":     after_hours_pct,
        "switch_rate":         round(switch_rate, 3),
        "deep_work_units":     deep_work_units,
        "idle_minutes":        idle_minutes,
        "title_entropy":       title_entropy,
        "temporal_consistency": temporal_consistency,
        "idle_ratio":          round(idle_ratio, 3),
    }


def _compute_burnout(
    after_hours_pct: float,
    distraction_pct: float,
    switch_rate: float,
    avg_focus: float,
    efficiency: float,
    **kwargs,
) -> float:
    """Weighted burnout score 0-100."""
    score = 0.0
    score += (after_hours_pct / 100) * 30     # after-hours penalty (max 30)
    score += (distraction_pct / 100) * 25     # distraction penalty (max 25)
    score += switch_rate * 25                  # context-switch penalty (max 25)
    score += max((5 - avg_focus) / 5, 0) * 10 # short focus blocks (max 10)
    score += max((50 - efficiency) / 50, 0) * 10  # low efficiency (max 10)
    
    # GAP 5: Idle detection (minor EE signal)
    idle_minutes = kwargs.get("idle_minutes", 0.0)
    score += min(idle_minutes / 120, 1.0) * 5   # max 5 points for 2+ hours idle
    
    return min(score, 100.0)

# In services/scoring.py — add to compute_stats()

def compute_stats(events: list[dict]) -> dict:
    # ... existing code ...
    
    # NEW: Idle-adjusted productive time
    # Any event with idle_minutes > 5 is excluded from focus scoring
    # even if the category is Productive
    active_events = [
        e for e in events
        if e.get("idle_minutes", 0) <= 5
    ]
    
    # Recalculate focus blocks on ACTIVE events only
    active_cats = [e.get("category","") for e in active_events]
    focus_blocks = []
    cur = 0
    for cat in active_cats:
        if cat.lower() in PRODUCTIVE_CATS:
            cur += 1
        else:
            if cur > 0: focus_blocks.append(cur)
            cur = 0
    if cur > 0: focus_blocks.append(cur)
    
    # Idle ratio — what fraction of session was idle
    idle_ratio = 1 - (len(active_events) / max(total, 1))
    
    # Penalise: high idle_ratio with high claimed efficiency = suspicious
    idle_penalty = idle_ratio * 20  # up to 20 pts burnout penalty for high idle

def _risk_level(burnout: float) -> str:
    if burnout >= 75: return "CRITICAL"
    if burnout >= 55: return "HIGH"
    if burnout >= 35: return "MEDIUM"
    return "LOW"


def _window_title_entropy(events: list[dict]) -> float:
    """
    Shannon entropy of unique window titles within productive events.
    Low entropy = same window repeated = suspicious.
    High entropy = genuine navigation across files/contexts.
    Returns 0.0 (no diversity) to 1.0 (maximum diversity).
    """
    from collections import Counter
    import math
    import re
    
    def _normalise_title(t: str) -> str:
        t = re.sub(r'\d{2}:\d{2}(:\d{2})?', '', t)  # strip HH:MM
        t = re.sub(r'\b\d{4,}\b', '', t)            # strip long numbers
        t = re.sub(r'[\*\[\]\(\)]', '', t)          # strip markers
        return t.lower().strip()
    
    titles = [
        _normalise_title(e.get("window_title", ""))
        for e in events
        if e.get("category", "").lower() in PRODUCTIVE_CATS
        and e.get("window_title")
    ]
    
    if len(titles) < 3:
        return 0.5  # not enough data — neutral
    
    counts = Counter(titles)
    total_titles = sum(counts.values())
    
    entropy = -sum(
        (c / total_titles) * math.log2(c / total_titles)
        for c in counts.values()
    )
    max_entropy = math.log2(len(counts)) if len(counts) > 1 else 1
    
    return round(entropy / max_entropy, 3) if max_entropy > 0 else 0.0


def _temporal_consistency_score(events: list[dict]) -> float:
    """
    Measures whether the event timing distribution looks human.
    
    Gaming signature: many events in a very short window (rapid open/close),
    or perfectly uniform spacing (automated/scripted).
    
    Human signature: Poisson-like arrival process with natural clustering.
    Returns 0.0 (suspicious) to 1.0 (natural).
    """
    import numpy as np
    
    raw_ts = [_parse_ts(e.get("timestamp")) for e in events]
    timestamps = sorted([ts for ts in raw_ts if ts is not None])
    
    if len(timestamps) < 6:
        return 0.8  # not enough data
    
    # Inter-event intervals in seconds
    intervals = [
        (timestamps[i+1] - timestamps[i]).total_seconds()
        for i in range(len(timestamps)-1)
    ]
    
    if not intervals:
        return 0.8
    
    intervals_arr = np.array(intervals)
    
    # Flag 1: Burst gaming — many events in < 60 seconds
    # using 10 sec threshold as specified
    burst_ratio = np.mean(intervals_arr < 10)  # fraction under 10 sec apart
    burst_penalty = burst_ratio * 0.6  # heavy penalty for bursts
    
    # Flag 2: Robotic uniformity — too-perfect spacing (CV near 0)
    cv = np.std(intervals_arr) / (np.mean(intervals_arr) + 1e-6)
    uniformity_penalty = max(0, 0.3 - cv) * 1.0  # penalty if CV < 0.3
    
    score = max(0.0, 1.0 - burst_penalty - uniformity_penalty)
    return round(float(score), 3)


def _after_hours_severity(ts: datetime | None) -> float:
    if ts is None: return 0.0
    h = ts.hour
    if 9 <= h < 19: return 0.0   # core hours
    if 19 <= h < 21: return 1.0  # mild after-hours
    if 21 <= h < 23: return 1.5  # serious
    return 2.5                      # 23:00–06:00 critical


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
        "focus_flow_state": False, "focus_streak": 0.0, "distraction_pct": 0.0,
        "after_hours_pct": 0.0, "switch_rate": 0.0, "deep_work_units": 0,
        "title_entropy": 0.5, "temporal_consistency": 0.8, "idle_ratio": 0.0,
    }
