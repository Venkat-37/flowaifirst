"""routes/telemetry.py — Ingest live telemetry events."""
from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from database import activity_col, twins_col, tracking_col, twin_history_col
from middleware.auth import get_current_user
from models import TelemetryIngest, MoodIngest
from services.scoring import compute_stats
from services.audit import log_event_bg, TELEMETRY_INGEST

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


# ── MongoDB Indexes (call once at startup) ────────────────────────────────────

async def ensure_telemetry_indexes():
    """Create compound indexes for fast activity queries over long tracking periods."""
    col = activity_col()
    # Primary query pattern: events by emp_id sorted by timestamp
    await col.create_index([("emp_id", 1), ("timestamp", -1)], background=True)
    # For daily stats queries
    await col.create_index([("emp_id", 1), ("timestamp", -1), ("category", 1)], background=True)
    # Tracking sessions
    await tracking_col().create_index([("emp_id", 1)], unique=True, background=True)
    print("[OK] Telemetry indexes ensured")


@router.post("/ingest")
async def ingest_event(event: TelemetryIngest, user: dict = Depends(get_current_user)):
    """
    Ingest a single live telemetry event from the desktop agent.
    Updates the employee's digital twin immediately.
    """
    emp_id = event.emp_id.upper()
    doc = {
        "emp_id":       emp_id,
        "timestamp":    event.timestamp or datetime.utcnow(),
        "app_name":     event.app_name,
        "window_title": event.window_title,
        "category":     event.category,
        "department":   "",  # could look up from employee record
    }
    await activity_col().insert_one(doc)

    # Recompute twin from last 100 events for responsiveness
    recent = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)

    if recent:
        stats = compute_stats(recent)
        now_dt = datetime.utcnow()
        await twins_col().update_one(
            {"emp_id": emp_id},
            {"$set": {**stats, "last_updated": now_dt}},
            upsert=True,
        )

        event_count = await activity_col().count_documents({"emp_id": emp_id})
        if event_count % 10 == 0:
            snap = {"emp_id": emp_id, "snapped_at": now_dt, **stats}
            snap.pop("_id", None)
            await twin_history_col().insert_one(snap)

    log_event_bg(TELEMETRY_INGEST, actor=user.get("sub", ""), target=emp_id,
                 details={"app_name": event.app_name, "category": event.category, "source": "authenticated"})
    return {"status": "ok", "emp_id": emp_id}

@router.post("/mood")
async def ingest_mood(event: MoodIngest, user: dict = Depends(get_current_user)):
    """
    Ingest a daily mood check-in from the employee.
    Logs as an activity event with category 'Wellness_Check_In'.
    """
    emp_id = event.emp_id.upper()
    doc = {
        "emp_id":       emp_id,
        "timestamp":    event.timestamp or datetime.utcnow(),
        "app_name":     "FlowAI_Dashboard",
        "window_title": f"Mood_Score_{event.mood_score}",
        "category":     "Wellness_Check_In",
        "department":   "", 
        "mood_score":   event.mood_score
    }
    await activity_col().insert_one(doc)
    
    # Store explicit mood in twin for immediate dashboard retrieval
    await twins_col().update_one(
        {"emp_id": emp_id},
        {"$set": {"last_mood_score": event.mood_score, "last_updated": datetime.utcnow()}},
        upsert=True
    )
    
    return {"status": "ok"}


@router.post("/agent-ingest")
async def agent_ingest(event: TelemetryIngest):
    """
    Ingest telemetry from the desktop monitor agent.
    No JWT required — used by the local monitoring script.
    """
    emp_id = event.emp_id.upper()
    doc = {
        "emp_id":       emp_id,
        "timestamp":    event.timestamp or datetime.utcnow(),
        "app_name":     event.app_name,
        "window_title": event.window_title,
        "category":     event.category,
        "department":   "",
    }
    await activity_col().insert_one(doc)

    # Recompute twin from last 100 events
    recent = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)

    if recent:
        stats = compute_stats(recent)
        now_dt = datetime.utcnow()
        await twins_col().update_one(
            {"emp_id": emp_id},
            {"$set": {**stats, "last_updated": now_dt}},
            upsert=True,
        )

        event_count = await activity_col().count_documents({"emp_id": emp_id})
        if event_count % 10 == 0:
            snap = {"emp_id": emp_id, "snapped_at": now_dt, **stats}
            snap.pop("_id", None)
            await twin_history_col().insert_one(snap)

    log_event_bg(TELEMETRY_INGEST, actor="agent", target=emp_id,
                 details={"app_name": event.app_name, "category": event.category, "source": "desktop_agent"})
    return {"status": "ok", "emp_id": emp_id}


@router.get("/live-activity/{emp_id}")
async def live_activity(emp_id: str, user: dict = Depends(get_current_user)):
    """
    Return the 50 most recent activity events + daily summary for an employee.
    Used for real-time system monitoring in Twin Mirror / Employee Dashboard.
    """
    emp_id = emp_id.upper()
    now = datetime.utcnow()

    # Fetch recent events (increased to 50 for better visibility)
    events = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(50).to_list(50)

    for e in events:
        ts = e.get("timestamp")
        if hasattr(ts, "isoformat"):
            delta = (now - ts).total_seconds()
            e["seconds_ago"] = max(int(delta), 0)  # prevent negative values
            e["timestamp"] = ts.isoformat()
        elif isinstance(ts, str):
            try:
                parsed = datetime.fromisoformat(ts.replace("Z", ""))
                delta = (now - parsed).total_seconds()
                e["seconds_ago"] = max(int(delta), 0)
            except ValueError:
                e["seconds_ago"] = None

    # Current app = most recent event
    current_app = events[0] if events else None

    # Daily summary: count today's events by category
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_events = await activity_col().count_documents(
        {"emp_id": emp_id, "timestamp": {"$gte": today_start}}
    )
    today_productive = await activity_col().count_documents(
        {"emp_id": emp_id, "timestamp": {"$gte": today_start},
         "category": {"$in": ["Productive", "Productive (Contextual)"]}}
    )
    today_distraction = await activity_col().count_documents(
        {"emp_id": emp_id, "timestamp": {"$gte": today_start},
         "category": "Distraction"}
    )

    # Check tracking status
    tracking = await tracking_col().find_one({"emp_id": emp_id})
    tracking_active = bool(tracking and tracking.get("active", False))

    return {
        "emp_id": emp_id,
        "current_app": current_app,
        "events": events,
        "total": len(events),
        "polled_at": now.isoformat(),
        "tracking_active": tracking_active,
        "daily_summary": {
            "total_events": today_events,
            "productive": today_productive,
            "distraction": today_distraction,
            "neutral": today_events - today_productive - today_distraction,
        },
    }


@router.get("/hr-overview")
async def hr_overview(user: dict = Depends(get_current_user)):
    """
    Legacy endpoint mirroring original /api/hr-stats shape.
    Used by components that need a simple flat stats object.
    """
    col = twins_col()
    all_twins = await col.find({}, {"_id": 0}).to_list(None)

    if not all_twins:
        return {"efficiency": 0, "burnout_risk": 0, "total_staff": 0, "departments": {}}

    total_staff = len(all_twins)
    avg_eff     = sum(t["efficiency"] for t in all_twins) / total_staff
    at_risk     = sum(1 for t in all_twins if t["risk_level"] in ("HIGH", "CRITICAL"))

    dept_map: dict[str, list] = {}
    for t in all_twins:
        dept_map.setdefault(t["department"], []).append(t["efficiency"])
    dept_eff = {d: round(sum(v) / len(v), 1) for d, v in dept_map.items()}

    return {
        "efficiency":  round(avg_eff, 1),
        "burnout_risk": at_risk,
        "total_staff":  total_staff,
        "departments":  dept_eff,
    }


# ── Tracking Agent Control ────────────────────────────────────────────────────

# App categorisation maps (Intelligent classification)
_PRODUCTIVE_TOOLS = [
    'visual studio', 'vscode', 'pycharm', 'intellij', 'webstorm',
    'sublime', 'notepad++', 'terminal', 'cmd', 'powershell',
    'postman', 'insomnia', 'github desktop', 'figma', 'notion', 'obsidian',
    'jupyter', 'antigravity', 'excel', 'powerpoint', 'word'
]

_PRODUCTIVE_KEYWORDS = [
    'stack overflow', 'stackoverflow', 'github', 'gitlab', 'bitbucket',
    'docs', 'mdn', 'npm', 'api reference', 'tutorial', 'mongodb', 
    'react', 'fastapi', 'localhost', '127.0.0.1', 'chatgpt',
    'claude', 'gemini', 'colab', 'dev tools', 'flowai', 'workspace', 'directory structure'
]

_DISTRACTION_INDICATORS = [
    'whatsapp', 'telegram', 'discord', 'spotify', 'vlc', 'steam', 'epic games', 
    'youtube', 'netflix', 'instagram', 'facebook', 'twitter', 'x.com',
    'reddit', 'tiktok', 'twitch', 'amazon', 'flipkart', 'hotstar', 'prime video', 'music', 'podcast'
]

def _auto_categorise(app_name: str, window_title: str) -> str:
    """Intelligent server-side app categorisation."""
    app_lower = (app_name or "").lower()
    title_lower = (window_title or "").lower()
    combined = f"{app_lower} | {title_lower}"

    # Distractions always take precedence (e.g., Spotify running inside Edge)
    for dist in _DISTRACTION_INDICATORS:
        if dist in combined:
            return "Distraction"

    # Core Productivity Apps (Native tools)
    for tool in _PRODUCTIVE_TOOLS:
        if tool in app_lower or tool in title_lower:
            return "Productive"

    # Contextual Productivity (Browser tabs, research, documentation, etc.)
    for kw in _PRODUCTIVE_KEYWORDS:
        if kw in combined:
            return "Productive (Contextual)"

    return "Neutral"


@router.get("/is-tracking-active/{emp_id}")
async def is_tracking_active(emp_id: str):
    """Polled by the desktop agent to check if tracking is enabled."""
    emp_id = emp_id.upper()
    doc = await tracking_col().find_one({"emp_id": emp_id})
    return {"active": bool(doc and doc.get("active", False)), "emp_id": emp_id}


@router.post("/start-tracking/{emp_id}")
async def start_tracking(emp_id: str, user: dict = Depends(get_current_user)):
    """Toggle tracking ON for an employee (called from dashboard)."""
    emp_id = emp_id.upper()
    await tracking_col().update_one(
        {"emp_id": emp_id},
        {"$set": {"active": True, "started_at": datetime.utcnow(), "started_by": user.get("sub", "")}},
        upsert=True,
    )
    log_event_bg(TELEMETRY_INGEST, actor=user.get("sub", ""), target=emp_id,
                 details={"action": "start_tracking"})
    return {"active": True, "emp_id": emp_id}


@router.post("/stop-tracking/{emp_id}")
async def stop_tracking(emp_id: str, user: dict = Depends(get_current_user)):
    """Toggle tracking OFF for an employee."""
    emp_id = emp_id.upper()
    await tracking_col().update_one(
        {"emp_id": emp_id},
        {"$set": {"active": False, "stopped_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"active": False, "emp_id": emp_id}


@router.post("/track-activity")
async def track_activity(body: dict):
    """
    Unauthenticated ingest from the desktop tracking agent.
    Accepts the agent's payload format and auto-categorises the app.
    Maps to the existing twin-update pipeline.
    """
    emp_id = (body.get("Employee_ID") or body.get("emp_id") or "").upper()
    if not emp_id:
        from fastapi import HTTPException
        raise HTTPException(400, "Employee_ID is required")

    app_name = body.get("app_name", "Unknown")
    window_title = body.get("window_title", "")

    # Always use UTC for consistency — ignore agent's local timestamp
    # This ensures seconds_ago calculations are always accurate
    ts = datetime.utcnow()

    # Auto-categorise
    category = _auto_categorise(app_name, window_title)

    doc = {
        "emp_id":       emp_id,
        "timestamp":    ts,
        "app_name":     app_name,
        "window_title": window_title,
        "category":     category,
        "department":   "",
        "source":       "tracking_agent",
    }
    await activity_col().insert_one(doc)

    # Recompute twin from last 100 events
    recent = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)

    if recent:
        stats = compute_stats(recent)
        now_dt = datetime.utcnow()
        await twins_col().update_one(
            {"emp_id": emp_id},
            {"$set": {**stats, "last_updated": now_dt}},
            upsert=True,
        )

        event_count = await activity_col().count_documents({"emp_id": emp_id})
        if event_count % 10 == 0:
            snap = {"emp_id": emp_id, "snapped_at": now_dt, **stats}
            snap.pop("_id", None)
            await twin_history_col().insert_one(snap)

    log_event_bg(TELEMETRY_INGEST, actor="tracking_agent", target=emp_id,
                 details={"app_name": app_name, "category": category, "source": "tracking_agent"})
    return {"status": "ok", "emp_id": emp_id, "category": category}


@router.get("/daily-stats/{emp_id}")
async def daily_stats(emp_id: str, user: dict = Depends(get_current_user)):
    """
    Full-day tracking summary with hourly breakdown.
    Shows total events, productivity ratio, and per-hour activity counts.
    """
    emp_id = emp_id.upper()
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # All events from today
    events = await activity_col().find(
        {"emp_id": emp_id, "timestamp": {"$gte": today_start}},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(None)

    total = len(events)
    productive = sum(1 for e in events if e.get("category", "").lower() in
                     {"productive", "productive (contextual)"})
    distraction = sum(1 for e in events if e.get("category", "").lower() == "distraction")
    neutral = total - productive - distraction

    # Hourly breakdown
    hourly = {}
    for e in events:
        ts = e.get("timestamp")
        if hasattr(ts, "hour"):
            h = ts.hour
        elif isinstance(ts, str):
            try:
                h = datetime.fromisoformat(ts.replace("Z", "")).hour
            except Exception:
                continue
        else:
            continue
        key = f"{h:02d}:00"
        hourly.setdefault(key, {"total": 0, "productive": 0, "distraction": 0, "neutral": 0})
        hourly[key]["total"] += 1
        cat = e.get("category", "").lower()
        if cat in {"productive", "productive (contextual)"}:
            hourly[key]["productive"] += 1
        elif cat == "distraction":
            hourly[key]["distraction"] += 1
        else:
            hourly[key]["neutral"] += 1

    # Tracking session info
    tracking = await tracking_col().find_one({"emp_id": emp_id})
    started_at = tracking.get("started_at") if tracking else None
    tracking_duration_mins = 0
    if started_at and tracking and tracking.get("active"):
        tracking_duration_mins = int((now - started_at).total_seconds() / 60)

    return {
        "emp_id": emp_id,
        "date": today_start.isoformat(),
        "total_events": total,
        "productive": productive,
        "distraction": distraction,
        "neutral": neutral,
        "productivity_ratio": round(productive / max(total, 1) * 100, 1),
        "hourly_breakdown": dict(sorted(hourly.items())),
        "tracking_active": bool(tracking and tracking.get("active")),
        "tracking_duration_mins": tracking_duration_mins,
    }
