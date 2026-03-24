"""services/audit.py — Centralised audit logger for FlowAI.

Every significant system event (login, actuation, AI insight, telemetry,
twin refresh, etc.) is written to the `audit_log` collection in MongoDB
for compliance, analytics, and professional record-keeping.

Schema per document:
    event_type:   str     — e.g. "auth.login", "actuation.fire", "insight.generate"
    actor:        str     — who triggered (emp_id / google_uid / "system")
    actor_role:   str     — "HR Manager" | "Employee" | "system"
    target:       str     — affected resource (emp_id, trigger name, etc.)
    details:      dict    — event-specific payload (kept lean for storage)
    ip:           str     — client IP address
    timestamp:    datetime
    session_id:   str     — optional correlation ID
"""
from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Optional
from database import audit_col


# ── Event type constants ──────────────────────────────────────────────────────

# Auth
AUTH_LOGIN          = "auth.login"
AUTH_LOGOUT         = "auth.logout"
AUTH_DEMO_LOGIN     = "auth.demo_login"

# Actuation
ACTUATION_FIRE      = "actuation.fire"
ACTUATION_WEBHOOK   = "actuation.webhook"

# AI Insights
INSIGHT_GENERATE    = "insight.generate"
INSIGHT_FALLBACK    = "insight.fallback"

# Telemetry
TELEMETRY_INGEST    = "telemetry.ingest"

# Twin
TWIN_REFRESH        = "twin.refresh"
TWIN_CREATE         = "twin.create"

# Wellness
WELLNESS_CHECKIN    = "wellness.checkin"
WELLNESS_GOAL       = "wellness.goal"

# Feedback
FEEDBACK_RATE       = "feedback.rate"

# Notification
NOTIFICATION_READ   = "notification.read"

# System
SYSTEM_SEED         = "system.seed"
SYSTEM_STARTUP      = "system.startup"


# ── Core log function ─────────────────────────────────────────────────────────

async def log_event(
    event_type: str,
    actor: str = "system",
    actor_role: str = "system",
    target: str = "",
    details: Optional[dict] = None,
    ip: str = "",
    session_id: str = "",
) -> None:
    """
    Write a single audit event to MongoDB. Fire-and-forget — never blocks
    the caller or raises exceptions.
    """
    doc = {
        "event_type":  event_type,
        "actor":       actor,
        "actor_role":  actor_role,
        "target":      target,
        "details":     details or {},
        "ip":          ip,
        "session_id":  session_id,
        "timestamp":   datetime.utcnow(),
    }
    try:
        await audit_col().insert_one(doc)
    except Exception as e:
        # Never fail the parent operation because of audit
        print(f"  ⚠ Audit log write failed: {e}")


def log_event_bg(
    event_type: str,
    actor: str = "system",
    actor_role: str = "system",
    target: str = "",
    details: Optional[dict] = None,
    ip: str = "",
    session_id: str = "",
) -> None:
    """Fire-and-forget background version — safe to call from sync contexts."""
    asyncio.create_task(log_event(
        event_type=event_type,
        actor=actor,
        actor_role=actor_role,
        target=target,
        details=details,
        ip=ip,
        session_id=session_id,
    ))


# ── Index creation (called on startup) ───────────────────────────────────────

async def ensure_audit_indexes() -> None:
    """Create indexes for efficient querying of audit logs."""
    col = audit_col()
    await col.create_index("event_type")
    await col.create_index("actor")
    await col.create_index("target")
    await col.create_index("timestamp")
    await col.create_index([("event_type", 1), ("timestamp", -1)])
    print("  [OK] Audit log indexes ready")
