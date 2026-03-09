"""services/privacy.py — Privacy-preserving data sanitisation before LLM calls.

Addresses the PRD's "Zero-Knowledge Tracking" and GDPR compliance goals:
  1. PII is stripped before any data leaves the platform.
  2. Laplacian differential-privacy noise is injected into numerical metrics
     so individual values cannot be reverse-engineered from the LLM prompt.
  3. A sanitisation audit log is returned alongside the cleaned payload so
     HR managers can inspect exactly what the model received.
"""
from __future__ import annotations
import math
import random
import re

# ── 1. Laplacian noise ────────────────────────────────────────────────────────

def _laplace(sensitivity: float, epsilon: float) -> float:
    """Draw a sample from the Laplace distribution.

    sensitivity = max change one individual's data can cause (Δf)
    epsilon     = privacy budget (smaller = more noise = stronger privacy)
    The scale parameter b = sensitivity / epsilon.
    """
    b = sensitivity / max(epsilon, 1e-9)
    u = random.uniform(-0.5, 0.5)
    # Inverse CDF of Laplace
    return -b * math.copysign(1, u) * math.log(1 - 2 * abs(u))


def add_dp_noise(value: float, sensitivity: float = 10.0, epsilon: float = 1.0,
                 lo: float = 0.0, hi: float = 100.0) -> float:
    """Add calibrated Laplacian noise to a single numerical metric and clamp."""
    noisy = value + _laplace(sensitivity, epsilon)
    return round(max(lo, min(hi, noisy)), 2)


# ── 2. PII stripping ──────────────────────────────────────────────────────────

_EMP_ID_RE = re.compile(r'\bEMP\d{3,6}\b', re.IGNORECASE)
_EMAIL_RE  = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}')
_NAME_RE   = re.compile(r'(?i)\b(name|employee|user|staff):\s*\S+')

def strip_pii(text: str) -> str:
    """Remove obvious PII patterns from a free-text string."""
    text = _EMP_ID_RE.sub('[EMPLOYEE_ID]', text)
    text = _EMAIL_RE.sub('[EMAIL]', text)
    text = _NAME_RE.sub(r'\1: [REDACTED]', text)
    return text


# ── 3. Stats sanitisation ────────────────────────────────────────────────────

def sanitise_employee_stats(emp_id: str, stats: dict, epsilon: float = 1.0) -> tuple[dict, dict]:
    """
    Return (sanitised_payload, audit_record).

    sanitised_payload — what gets sent to the LLM:
      - emp_id replaced with an opaque hash-like token
      - numerical scores perturbed with ε-DP Laplacian noise
      - no raw app names, window titles, or timestamps

    audit_record — what is stored locally so reviewers can verify compliance.
    """
    import hashlib
    anon_id = "EMP-" + hashlib.sha256(emp_id.encode()).hexdigest()[:8].upper()

    original = {
        "efficiency":        stats.get("efficiency", 0.0),
        "burnout_score":     stats.get("burnout_score", 0.0),
        "cognitive_battery": stats.get("cognitive_battery", 100.0),
        "distraction_pct":   stats.get("distraction_pct", 0.0),
        "after_hours_pct":   stats.get("after_hours_pct", 0.0),
        "switch_rate":       stats.get("switch_rate", 0.0) * 100,  # convert to 0-100
    }

    noisy = {k: add_dp_noise(v, sensitivity=5.0, epsilon=epsilon) for k, v in original.items()}

    sanitised = {
        "anon_id":           anon_id,
        "department":        stats.get("department", "Unknown"),   # kept – not PII
        "risk_level":        stats.get("risk_level", "LOW"),       # categorical – kept
        "focus_flow_state":  stats.get("focus_flow_state", False), # boolean – kept
        # DP-noised numerics ↓
        "efficiency":        noisy["efficiency"],
        "burnout_score":     noisy["burnout_score"],
        "cognitive_battery": noisy["cognitive_battery"],
        "distraction_pct":   noisy["distraction_pct"],
        "after_hours_pct":   noisy["after_hours_pct"],
        "switch_rate_pct":   noisy["switch_rate"],
        # Aggregated counts only – no raw events
        "total_events":      stats.get("total_events", 0),
    }

    audit = {
        "emp_id":         emp_id,
        "anon_id":        anon_id,
        "epsilon":        epsilon,
        "original_scores": original,
        "noised_scores":   noisy,
        "pii_stripped":   True,
        "raw_apps_sent":  False,
    }

    return sanitised, audit


def sanitise_department_stats(dept: str, emp_stats: list[dict],
                               epsilon: float = 1.0) -> tuple[dict, dict]:
    """Sanitise aggregated department stats for LLM consumption."""
    if not emp_stats:
        return {"department": dept, "count": 0}, {}

    n = len(emp_stats)
    avg_eff  = sum(e.get("efficiency", 0)    for e in emp_stats) / n
    avg_burn = sum(e.get("burnout_score", 0) for e in emp_stats) / n

    # Department-level noise is lower (aggregate queries have lower sensitivity)
    dept_epsilon = epsilon * 2

    sanitised = {
        "department":     dept,
        "team_size":      n,
        "avg_efficiency": add_dp_noise(avg_eff,  sensitivity=3.0, epsilon=dept_epsilon),
        "avg_burnout":    add_dp_noise(avg_burn, sensitivity=3.0, epsilon=dept_epsilon),
        "at_risk_count":  sum(1 for e in emp_stats if e.get("risk_level") in ("HIGH", "CRITICAL")),
        "critical_count": sum(1 for e in emp_stats if e.get("risk_level") == "CRITICAL"),
        "in_flow_count":  sum(1 for e in emp_stats if e.get("focus_flow_state")),
    }

    audit = {
        "department": dept,
        "n": n,
        "epsilon": dept_epsilon,
        "pii_stripped": True,
    }

    return sanitised, audit
