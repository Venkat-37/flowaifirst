"""services/actuation.py — Bidirectional digital-twin actuation bridge with Slack + in-app notifications.

When HR fires a trigger (Critical Alert, Wellness Alert, etc.):
  1. Persists to MongoDB actuations collection
  2. Creates an in-app notification for the employee
  3. Sends a rich Slack Block Kit message via webhook
  4. Logs to console in development mode
"""
from __future__ import annotations
import asyncio
import hmac
import hashlib
from datetime import datetime
from typing import Optional
import httpx

from database import get_db
from config import get_settings
from services.audit import log_event_bg, ACTUATION_FIRE, ACTUATION_WEBHOOK


# ── Trigger types ─────────────────────────────────────────────────────────────

TRIGGER_DO_NOT_DISTURB  = "DO_NOT_DISTURB"
TRIGGER_DEEP_WORK_MODE  = "DEEP_WORK_MODE"
TRIGGER_RESUME_NORMAL   = "RESUME_NORMAL"
TRIGGER_WELLNESS_ALERT  = "WELLNESS_ALERT"
TRIGGER_CRITICAL_ALERT  = "CRITICAL_BURNOUT_ALERT"

# Emoji + labels for each trigger
TRIGGER_META = {
    TRIGGER_DO_NOT_DISTURB: {"emoji": "🔕", "label": "Do Not Disturb", "severity": "high",
        "employee_msg": "Your HR team has noticed you may be overwhelmed. They've activated Do Not Disturb mode to protect your focus time. Take a break — you've earned it."},
    TRIGGER_DEEP_WORK_MODE: {"emoji": "🎯", "label": "Deep Work Mode", "severity": "info",
        "employee_msg": "You're in a flow state! Your team has cleared your schedule. Non-essential notifications are paused so you can do your best work."},
    TRIGGER_RESUME_NORMAL: {"emoji": "✅", "label": "All Clear", "severity": "low",
        "employee_msg": "Great news — your burnout indicators have improved! Normal notification settings have been restored. Keep up the healthy balance."},
    TRIGGER_WELLNESS_ALERT: {"emoji": "💚", "label": "Wellness Check-in", "severity": "medium",
        "employee_msg": "Your HR team cares about your wellbeing. Consider taking a short break, doing some stretching, or checking in with the Wellness Studio."},
    TRIGGER_CRITICAL_ALERT: {"emoji": "🚨", "label": "Critical Burnout Alert", "severity": "critical",
        "employee_msg": "Your burnout levels are critically high. Your HR team has been notified and wants to help. Please consider stepping away, and expect a supportive 1:1 check-in soon."},
}


def _anonymise_id(emp_id: str) -> str:
    """HMAC-SHA256 anonymisation — irreversible without the secret key."""
    key = get_settings().anon_hmac_key
    if not key:
        key = "flowai-default-anon-key"
    token = hmac.new(key.encode(), emp_id.encode(), hashlib.sha256).hexdigest()[:8].upper()
    return f"EMP-{token}"


def _build_payload(emp_id: str, trigger: str, context: dict) -> dict:
    meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger, "severity": "medium", "employee_msg": ""})
    return {
        "source":    "FlowAI v3 Digital Twin",
        "version":   "3.0.0",
        "trigger":   trigger,
        "emp_id":    emp_id,
        "anon_emp_id": _anonymise_id(emp_id),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "context":   context,
        "actions":   _suggested_actions(trigger),
        "severity":  meta["severity"],
        "label":     meta["label"],
        "emoji":     meta["emoji"],
    }


def _suggested_actions(trigger: str) -> list[str]:
    actions = {
        TRIGGER_DO_NOT_DISTURB: [
            "Set Slack status to 🚫 Do Not Disturb",
            "Pause non-critical Jira notifications",
            "Block calendar for recovery time",
        ],
        TRIGGER_DEEP_WORK_MODE: [
            "Set Slack status to 🎯 Deep Work",
            "Enable Focus Mode on macOS / Windows",
        ],
        TRIGGER_RESUME_NORMAL: [
            "Clear Do Not Disturb status",
            "Resume normal notification settings",
        ],
        TRIGGER_WELLNESS_ALERT: [
            "Take a 5-minute break",
            "Try the Guided Breathing exercise",
            "Complete a Wellness check-in",
        ],
        TRIGGER_CRITICAL_ALERT: [
            "Step away from work immediately",
            "Schedule 1:1 with your manager",
            "Visit the Wellness Studio",
        ],
    }
    return actions.get(trigger, [])


# ── Slack Block Kit builder ───────────────────────────────────────────────────

def _build_slack_blocks(emp_id: str, trigger: str, context: dict) -> dict:
    """Build a rich Slack Block Kit message for the actuation event."""
    meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger, "severity": "medium", "employee_msg": ""})

    burnout = context.get("burnout_score", 0)
    risk = context.get("risk_level", "UNKNOWN")
    efficiency = context.get("efficiency", 0)

    # Severity color
    color_map = {"critical": "#dc2626", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981", "info": "#8b5cf6"}
    color = color_map.get(meta["severity"], "#6b7280")

    actions = _suggested_actions(trigger)
    action_text = "\n".join(f"  •  {a}" for a in actions)

    return {
        "text": f"{meta['emoji']} FlowAI Alert: {meta['label']} for {emp_id}",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"{meta['emoji']} {meta['label']}", "emoji": True}
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Employee:* `{emp_id}`\n*Source:* FlowAI Digital Twin Platform"}
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*🔥 Burnout Score*\n{burnout:.0f} / 100"},
                    {"type": "mrkdwn", "text": f"*⚡ Efficiency*\n{efficiency:.0f}%"},
                    {"type": "mrkdwn", "text": f"*⚠️ Risk Level*\n{risk}"},
                    {"type": "mrkdwn", "text": f"*🕐 Triggered*\n<!date^{int(datetime.utcnow().timestamp())}^{{time}}|{datetime.utcnow().strftime('%H:%M UTC')}>"},
                ]
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Recommended Actions:*\n{action_text}"}
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": "📊 _Powered by FlowAI v3 Digital Twin Platform · Privacy-first · RLHF-calibrated_"}
                ]
            },
        ],
        "attachments": [{"color": color, "blocks": []}],
    }


# ── In-app notification builder ───────────────────────────────────────────────

async def _create_employee_notification(emp_id: str, trigger: str, context: dict, payload: dict) -> None:
    """Create an in-app notification for the employee to see when they log in."""
    meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger, "severity": "medium", "employee_msg": "You have a new notification from HR."})

    notification = {
        "emp_id":       emp_id,
        "type":         "actuation",
        "trigger":      trigger,
        "title":        f"{meta['emoji']} {meta['label']}",
        "message":      meta["employee_msg"],
        "severity":     meta["severity"],
        "actions":      payload.get("actions", []),
        "context":      {
            "burnout_score": context.get("burnout_score", 0),
            "risk_level":    context.get("risk_level", "UNKNOWN"),
            "efficiency":    context.get("efficiency", 0),
        },
        "read":         False,
        "created_at":   datetime.utcnow(),
    }

    try:
        db = get_db()
        await db["notifications"].insert_one(notification)
        print(f"  📬 In-app notification created for {emp_id}")
    except Exception as e:
        print(f"  ⚠ Notification write failed: {e}")


# ── Core fire function ────────────────────────────────────────────────────────

async def fire_actuation(
    emp_id: str,
    trigger: str,
    context: dict,
    webhook_url: Optional[str] = None,
) -> dict:
    """
    Build, log, persist, notify employee, and optionally POST a Slack webhook.
    Returns the full payload dict for API response.
    """
    payload = _build_payload(emp_id, trigger, context)

    # ── Persist to MongoDB ────────────────────────────────────────────────────
    try:
        db = get_db()
        await db["actuations"].insert_one({**payload, "_id_ts": datetime.utcnow()})
    except Exception as e:
        print(f"  ⚠ Actuation DB write failed: {e}")

    # ── Create in-app notification for the employee ───────────────────────────
    asyncio.create_task(_create_employee_notification(emp_id, trigger, context, payload))

    # ── Audit log ─────────────────────────────────────────────────────────────
    log_event_bg(
        ACTUATION_FIRE, actor="HR Manager", actor_role="HR Manager", target=emp_id,
        details={"trigger": trigger, "severity": payload.get("severity"),
                 "burnout_score": context.get("burnout_score", 0),
                 "risk_level": context.get("risk_level")},
    )

    # ── Attempt Slack webhook POST ────────────────────────────────────────────
    url = webhook_url or get_settings().actuation_webhook_url
    if url:
        slack_payload = _build_slack_blocks(emp_id, trigger, context)
        asyncio.create_task(_post_webhook(url, slack_payload))
    else:
        # Development mode: rich console log
        meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger})
        print(f"\n{'='*60}")
        print(f"  {meta['emoji']} ACTUATION FIRED  [{meta['label']}]")
        print(f"  Employee : {emp_id}")
        print(f"  Actions  : {', '.join(payload['actions'])}")
        print(f"  Timestamp: {payload['timestamp']}")
        print(f"  📬 In-app notification queued for employee")
        if url:
            print(f"  💬 Slack message sent")
        print(f"{'='*60}\n")

    return payload


async def _post_webhook(url: str, payload: dict) -> None:
    """Best-effort Slack webhook delivery — does not raise on failure."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                print(f"  ✓ Slack message delivered → {url[:40]}...")
            else:
                print(f"  ⚠ Slack returned {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        print(f"  ⚠ Slack delivery failed: {e}")


# ── Smart trigger logic (called after twin refresh) ───────────────────────────

async def evaluate_and_actuate(emp_id: str, old_twin: Optional[dict], new_twin: dict) -> Optional[dict]:
    """
    Compare old vs new twin state and fire the appropriate trigger.
    Returns the actuation payload if a trigger fired, else None.
    """
    new_risk   = new_twin.get("risk_level", "LOW")
    new_flow   = new_twin.get("focus_flow_state", False)
    new_burn   = new_twin.get("burnout_score", 0)

    old_risk   = (old_twin or {}).get("risk_level", "LOW")
    old_flow   = (old_twin or {}).get("focus_flow_state", False)

    context = {
        "burnout_score":    new_burn,
        "risk_level":       new_risk,
        "efficiency":       new_twin.get("efficiency", 0),
        "cognitive_battery": new_twin.get("cognitive_battery", 100),
    }

    # CRITICAL burnout — alert
    if new_risk == "CRITICAL" and old_risk != "CRITICAL":
        return await fire_actuation(emp_id, TRIGGER_CRITICAL_ALERT, context)

    # HIGH burnout → suggest Do Not Disturb
    if new_risk in ("HIGH", "CRITICAL") and old_risk in ("LOW", "MEDIUM"):
        return await fire_actuation(emp_id, TRIGGER_DO_NOT_DISTURB, context)

    # Entered focus flow
    if new_flow and not old_flow:
        return await fire_actuation(emp_id, TRIGGER_DEEP_WORK_MODE, context)

    # Recovered from high risk
    if new_risk in ("LOW", "MEDIUM") and old_risk in ("HIGH", "CRITICAL"):
        return await fire_actuation(emp_id, TRIGGER_RESUME_NORMAL, context)

    return None

