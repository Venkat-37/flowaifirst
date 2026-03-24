"""services/actuation.py — Bidirectional digital-twin actuation bridge with Slack + in-app notifications.

When HR fires a trigger (Critical Alert, Wellness Alert, etc.):
  1. Persists to MongoDB actuations collection
  2. Creates an in-app notification for the employee
  3. Sends a rich Slack Block Kit message via webhook
  4. Logs to console in development mode

ODE-aware triggers (v3.2):
  - When RPC drops below 20 -> CRITICAL_BURNOUT_ALERT (capacity near zero)
  - When RPC drops below 40 -> DO_NOT_DISTURB (pre-emptive protection)
  - When rpc_8h forecasts end-of-day collapse but current RPC looks safe -> DO_NOT_DISTURB
  These take priority over burnout-score triggers because the coupled
  fatigue-recovery ODE state is more precise than a single scalar score.
  Original burnout-score triggers remain as fallback when ODE has not yet run.
"""
from __future__ import annotations
import asyncio
import hmac
import hashlib
from datetime import datetime, timedelta
from typing import Optional
import httpx

from database import get_db
from config import get_settings
from services.audit import log_event_bg, ACTUATION_FIRE, ACTUATION_WEBHOOK
from services.bandit_service import bandit_service


# ── Trigger types ─────────────────────────────────────────────────────────────

TRIGGER_DO_NOT_DISTURB  = "DO_NOT_DISTURB"
TRIGGER_DEEP_WORK_MODE  = "DEEP_WORK_MODE"
TRIGGER_RESUME_NORMAL   = "RESUME_NORMAL"
TRIGGER_WELLNESS_ALERT  = "WELLNESS_ALERT"
TRIGGER_CRITICAL_ALERT  = "CRITICAL_BURNOUT_ALERT"
TRIGGER_PROACTIVE_INTERVENTION = "PROACTIVE_BURNOUT_INTERVENTION"

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
    TRIGGER_PROACTIVE_INTERVENTION: {"emoji": "🔮", "label": "Proactive ML Intervention", "severity": "high",
        "employee_msg": "Our system predicts your schedule may lead to burnout next week. Let's make adjustments now to safeguard your wellbeing."},
}


def _anonymise_id(emp_id: str) -> str:
    """HMAC-SHA256 anonymisation — irreversible without the secret key."""
    key = get_settings().anon_hmac_key
    if not key:
        key = "flowai-default-anon-key"
    token = hmac.new(key.encode(), emp_id.encode(), hashlib.sha256).hexdigest()[:8].upper()
    return f"EMP-{token}"


async def get_optimal_intervention(emp_id: str, trigger: str, context: dict) -> list[str]:
    """
    Use Thompson Sampling to select the best intervention for the employee.
    Falls back to defaults if necessary.
    """
    action = await bandit_service.get_action(emp_id, context)
    
    action_map = {
        "DO_NOT_DISTURB": [
            "Set Slack status to 🚫 Do Not Disturb",
            "Pause non-critical Jira notifications",
            "Block calendar for recovery time",
        ],
        "WELLNESS_CHECKIN": [
            "Take a 5-minute break",
            "Try the Guided Breathing exercise",
            "Complete a Wellness check-in",
        ],
        "BREATHING_EXERCISE": [
            "Try the 4-7-8 Guided Breathing exercise",
            "Step away for 3 minutes of mindfulness",
        ],
        "BLOCK_CALENDAR": [
            "Block 1 hour for 'Deep Focus' on your calendar",
            "Decline non-mandatory meetings for the next 2 hours",
        ],
        "REDUCE_MEETINGS": [
            "Request to move upcoming meetings to async/Slack",
            "Ask for a meeting summary instead of attending",
        ]
    }
    
    if action in action_map:
        return action_map[action]
        
    return _fallback_actions(trigger)


def _fallback_actions(trigger: str) -> list[str]:
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
        TRIGGER_PROACTIVE_INTERVENTION: [
            "Recommend reducing meeting load by 50% this week",
            "Clear Friday afternoon for focused recovery",
            "Schedule a proactive 1:1 check-in",
        ],
    }
    return actions.get(trigger, [])


async def submit_intervention_feedback(emp_id: str, action: str, effective: bool):
    """Update the bandit model based on intervention success."""
    reward = 1.0 if effective else 0.0
    await bandit_service.update_reward(emp_id, action, reward)


async def _build_payload(emp_id: str, trigger: str, context: dict) -> dict:
    meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger, "severity": "medium", "employee_msg": ""})
    actions = await get_optimal_intervention(emp_id, trigger, context)
    return {
        "source":    "FlowAI v3 Digital Twin",
        "version":   "3.2.0",
        "trigger":   trigger,
        "emp_id":    emp_id,
        "anon_emp_id": _anonymise_id(emp_id),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "context":   context,
        "actions":   actions,
        "severity":  meta["severity"],
        "label":     meta["label"],
        "emoji":     meta["emoji"],
    }


# ── Slack Block Kit builder ───────────────────────────────────────────────────

def _build_slack_blocks(emp_id: str, trigger: str, context: dict, actions: list[str]) -> dict:
    """Build a rich Slack Block Kit message for the actuation event."""
    meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger, "severity": "medium", "employee_msg": ""})

    burnout = context.get("burnout_score", 0)
    risk = context.get("risk_level", "UNKNOWN")
    efficiency = context.get("efficiency", 0)

    # ODE-derived fields
    rpc_current = context.get("rpc_current")
    capacity_risk = context.get("capacity_risk")
    rpc_8h = context.get("rpc_8h")

    color_map = {"critical": "#dc2626", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981", "info": "#8b5cf6"}
    color = color_map.get(meta["severity"], "#6b7280")

    action_text = "\n".join(f"  •  {a}" for a in actions)

    fields = [
        {"type": "mrkdwn", "text": f"*🔥 Burnout Score*\n{burnout:.0f} / 100"},
        {"type": "mrkdwn", "text": f"*⚡ Efficiency*\n{efficiency:.0f}%"},
        {"type": "mrkdwn", "text": f"*⚠️ Risk Level*\n{risk}"},
        {"type": "mrkdwn", "text": f"*🕐 Triggered*\n<!date^{int(datetime.utcnow().timestamp())}^{{time}}|{datetime.utcnow().strftime('%H:%M UTC')}>"},
    ]

    if rpc_current is not None:
        fields.append({"type": "mrkdwn", "text": f"*🔋 RPC Current*\n{rpc_current:.0f} / 100"})
    if rpc_8h is not None:
        fields.append({"type": "mrkdwn", "text": f"*📉 RPC 8h Forecast*\n{rpc_8h:.0f} / 100"})
    if capacity_risk is not None:
        fields.append({"type": "mrkdwn", "text": f"*🧮 Capacity Risk*\n{capacity_risk}"})

    blocks = [
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
            "fields": fields
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Recommended Actions:*\n{action_text}"}
        },
    ]

    if context.get("reason") == "forecast_collapse":
        blocks.append({
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f"⚠️ _{context.get('note', 'ODE forecast predicts end-of-day capacity collapse')}_"}
            ]
        })

    blocks.append({
        "type": "context",
        "elements": [
            {"type": "mrkdwn", "text": "📊 _Powered by FlowAI v3 Digital Twin Platform · Privacy-first · RLHF-calibrated · ODE capacity engine_"}
        ]
    })

    return {
        "text": f"{meta['emoji']} FlowAI Alert: {meta['label']} for {emp_id}",
        "blocks": blocks,
        "attachments": [{"color": color, "blocks": []}],
    }


# ── In-app notification builder ───────────────────────────────────────────────

async def _create_employee_notification(emp_id: str, trigger: str, context: dict, payload: dict) -> None:
    """Create an in-app notification for the employee."""
    meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger, "severity": "medium", "employee_msg": "You have a new notification from HR."})

    notification_context = {
        "burnout_score": context.get("burnout_score", 0),
        "risk_level":    context.get("risk_level", "UNKNOWN"),
        "efficiency":    context.get("efficiency", 0),
    }

    if context.get("rpc_current") is not None:
        notification_context["rpc_current"] = context["rpc_current"]
    if context.get("rpc_8h") is not None:
        notification_context["rpc_8h"] = context["rpc_8h"]
    if context.get("capacity_risk") is not None:
        notification_context["capacity_risk"] = context["capacity_risk"]
    if context.get("reason") == "forecast_collapse":
        notification_context["reason"] = "forecast_collapse"
        notification_context["note"] = context.get("note", "")

    notification = {
        "emp_id":       emp_id,
        "type":         "actuation",
        "trigger":      trigger,
        "trigger_key":  trigger,
        "title":        f"{meta['emoji']} {meta['label']}",
        "message":      meta["employee_msg"],
        "severity":     meta["severity"],
        "actions":      payload.get("actions", []),
        "context":      notification_context,
        "read":         False,
        "created_at":   datetime.utcnow(),
    }

    try:
        db = get_db()
        await db["notifications"].insert_one(notification)
    except Exception as e:
        print(f"  ⚠ Notification write failed: {e}")


# ── Core fire function ────────────────────────────────────────────────────────

async def fire_actuation(
    emp_id: str,
    trigger: str,
    context: dict,
    webhook_url: Optional[str] = None,
) -> dict:
    """Build, log, persist, notify, and optionally POST a Slack webhook."""
    db = get_db()
    
    # --- ALERt FATIGUE FILTER ---
    if not context.get("manual_override"):
        cooldown_hours = {
            "critical": 1,
            "high": 4,
            "medium": 24,
            "low": 24,
            "info": 24,
        }
        
        meta = TRIGGER_META.get(trigger, {"severity": "medium"})
        hours = cooldown_hours.get(meta["severity"], 24)
        threshold_time = datetime.utcnow() - timedelta(hours=hours)
        
        # Check if identical trigger fired for this employee within the active cooldown window
        recent_count = await db["actuations"].count_documents({
            "emp_id": emp_id,
            "trigger": trigger,
            "_id_ts": {"$gte": threshold_time}
        })
        
        if recent_count > 0:
            print(f"  [i] Actuation suppressed: {trigger} for {emp_id} is on a {hours}h cooldown.")
            return None
    # ----------------------------

    payload = await _build_payload(emp_id, trigger, context)
    actions = payload.get("actions", [])

    try:
        await db["actuations"].insert_one({**payload, "_id_ts": datetime.utcnow()})
    except Exception as e:
        print(f"  ⚠ Actuation DB write failed: {e}")

    asyncio.create_task(_create_employee_notification(emp_id, trigger, context, payload))

    log_event_bg(
        ACTUATION_FIRE, actor="system", actor_role="system", target=emp_id,
        details={"trigger": trigger, "severity": payload.get("severity"),
                 "burnout_score": context.get("burnout_score", 0),
                 "risk_level": context.get("risk_level"),
                 "rpc_current": context.get("rpc_current"),
                 "capacity_risk": context.get("capacity_risk"),
                 "ode_triggered": context.get("rpc_current") is not None},
    )

    url = webhook_url or get_settings().actuation_webhook_url
    if url:
        slack_payload = _build_slack_blocks(emp_id, trigger, context, actions)
        asyncio.create_task(_post_webhook(url, slack_payload))
    else:
        meta = TRIGGER_META.get(trigger, {"emoji": "📢", "label": trigger})
        print(f"\n{'='*60}\n  {meta['emoji']} ACTUATION FIRED  [{meta['label']}]\n  Employee : {emp_id}\n{'='*60}\n")

    return payload


async def _post_webhook(url: str, payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                print(f"  ⚠ Slack returned {resp.status_code}")
    except Exception as e:
        print(f"  ⚠ Slack delivery failed: {e}")


# ── Smart trigger logic ───────────────────────────────────────────────────────

async def evaluate_and_actuate(emp_id: str, old_twin: Optional[dict], new_twin: dict) -> Optional[dict]:
    new_risk   = new_twin.get("risk_level", "LOW")
    new_flow   = new_twin.get("focus_flow_state", False)
    new_burn   = new_twin.get("burnout_score", 0)

    old_risk   = (old_twin or {}).get("risk_level", "LOW")
    old_flow   = (old_twin or {}).get("focus_flow_state", False)

    new_rpc    = new_twin.get("rpc_current")
    old_rpc    = (old_twin or {}).get("rpc_current")

    context = {
        "burnout_score":     new_burn,
        "risk_level":        new_risk,
        "efficiency":        new_twin.get("efficiency", 0),
        "cognitive_battery": new_twin.get("cognitive_battery", 100),
        "rpc_current":       new_rpc,
        "capacity_risk":     new_twin.get("capacity_risk"),
        "rpc_8h":            new_twin.get("rpc_8h"),
    }

    if new_rpc is not None and new_rpc < 20:
        if old_rpc is None or old_rpc >= 20:
            return await fire_actuation(emp_id, TRIGGER_CRITICAL_ALERT, context)

    if new_rpc is not None and 20 <= new_rpc < 40:
        if old_rpc is None or old_rpc >= 40:
            return await fire_actuation(emp_id, TRIGGER_DO_NOT_DISTURB, context)

    rpc_8h = new_twin.get("rpc_8h")
    if rpc_8h is not None and new_rpc is not None and rpc_8h < 20 and new_rpc >= 40:
        return await fire_actuation(emp_id, TRIGGER_DO_NOT_DISTURB, {
            **context, "reason": "forecast_collapse",
            "note": f"RPC forecast to drop to {rpc_8h:.0f}/100 by end of workday"
        })

    from services.ml_forecasting import forecast_burnout
    forecast = await forecast_burnout(emp_id)
    if forecast and forecast.get("forecast_7d", 0) >= 80.0:
        return await fire_actuation(emp_id, TRIGGER_PROACTIVE_INTERVENTION, context)

    if new_risk == "CRITICAL" and old_risk != "CRITICAL":
        return await fire_actuation(emp_id, TRIGGER_CRITICAL_ALERT, context)

    if new_risk in ("HIGH", "CRITICAL") and old_risk in ("LOW", "MEDIUM"):
        return await fire_actuation(emp_id, TRIGGER_DO_NOT_DISTURB, context)

    if new_flow and not old_flow:
        return await fire_actuation(emp_id, TRIGGER_DEEP_WORK_MODE, context)

    if new_risk in ("LOW", "MEDIUM") and old_risk in ("HIGH", "CRITICAL"):
        return await fire_actuation(emp_id, TRIGGER_RESUME_NORMAL, context)

    return None