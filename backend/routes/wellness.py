"""routes/wellness.py — Wellness module: mood logs, plans, goals, pomodoro."""
from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from database import twins_col, activity_col, mood_col, goals_col, pomodoro_col
from middleware.auth import get_current_user, owns_employee_data
from services.scoring import compute_stats

router = APIRouter(prefix="/api/wellness", tags=["wellness"])


# ── Wellness score helper ─────────────────────────────────────────────────────

async def _compute_wellness_score(emp_id: str) -> dict:
    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if not twin:
        return {"wellness_score": 75, "max_focus_streak": 0,
                "after_hours_days": 0, "distraction_pct": 0, "days_active": 1}

    burnout = twin.get("burnout_score", 0)
    eff     = twin.get("efficiency", 70)

    # Calculate focus quality from context-switch rate
    switch_rate = twin.get("switch_rate", 0.3)                    # 0-1
    focus_quality = round((1 - min(switch_rate, 1.0)) * 100, 1)   # 0-100

    # Fetch last 7 days mood
    cutoff = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    moods = await mood_col().find({"emp_id": emp_id, "log_date": {"$gte": cutoff}}).to_list(None)
    avg_mood = sum(m["mood_score"] for m in moods) / len(moods) if moods else 3.5 # Default okay/good
    mood_factor = (avg_mood / 5.0) * 100

    # Weighted blend: 30% mood + 30% focus quality + 25% (100-burnout) + 15% efficiency
    raw = (mood_factor * 0.30) + (focus_quality * 0.30) + ((100 - burnout) * 0.25) + (eff * 0.15)
    score = round(max(0, min(100, raw)), 1)

    return {
        "wellness_score":   score,
        "max_focus_streak": twin.get("focus_flow_state", False) and 5 or 2,
        "after_hours_days": 1 if twin.get("after_hours_pct", 0) > 10 else 0,
        "distraction_pct":  twin.get("distraction_pct", 0),
        "days_active":      1,
    }


# ── GET /api/wellness/employee/{emp_id} ───────────────────────────────────────

@router.get("/employee/{emp_id}")
async def get_employee_wellness(emp_id: str, user: dict = Depends(get_current_user)):
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")
    return await _compute_wellness_score(emp_id)


# ── GET /api/wellness/stats/{emp_id} (alias for activity stats) ──────────────

@router.get("/stats/{emp_id}")
async def wellness_activity_stats(emp_id: str, user: dict = Depends(get_current_user)):
    """Return activity breakdown needed by the wellness activity panel."""
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")
    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if not twin:
        raise HTTPException(404, f"No data for {emp_id}")

    pipeline = [
        {"$match": {"emp_id": emp_id}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]
    cat_agg = await activity_col().aggregate(pipeline).to_list(None)
    category_counts = {b["_id"]: b["count"] for b in cat_agg}

    return {
        "total_events":     twin.get("total_events", 0),
        "efficiency":       twin.get("efficiency", 0),
        "burnout_score":    twin.get("burnout_score", 0),
        "cognitive_battery": twin.get("cognitive_battery", 100),
        "category_counts":  category_counts,
    }


# ── Mood logs ─────────────────────────────────────────────────────────────────

@router.post("/mood")
async def log_mood(body: dict, user: dict = Depends(get_current_user)):
    emp_id      = body.get("emp_id", "").upper()
    mood_score  = int(body.get("mood_score", 3))
    energy_score = int(body.get("energy_score", 3))
    note        = str(body.get("note", ""))[:500]

    if not 1 <= mood_score <= 5 or not 1 <= energy_score <= 5:
        raise HTTPException(400, "mood_score and energy_score must be 1-5")

    today = datetime.utcnow().strftime("%Y-%m-%d")
    col   = mood_col()

    await col.update_one(
        {"emp_id": emp_id, "log_date": today},
        {"$set": {
            "emp_id":       emp_id,
            "log_date":     today,
            "mood_score":   mood_score,
            "energy_score": energy_score,
            "note":         note,
            "logged_at":    datetime.utcnow(),
        }},
        upsert=True,
    )
    return {"status": "logged", "log_date": today}


@router.get("/mood/{emp_id}")
async def get_mood_history(emp_id: str, user: dict = Depends(get_current_user)):
    emp_id = emp_id.upper()
    col    = mood_col()

    cutoff = (datetime.utcnow() - timedelta(days=14)).strftime("%Y-%m-%d")
    cursor = col.find(
        {"emp_id": emp_id, "log_date": {"$gte": cutoff}},
        {"_id": 0}
    ).sort("log_date", 1)
    history = await cursor.to_list(None)

    today     = datetime.utcnow().strftime("%Y-%m-%d")
    today_log = next((h for h in history if h["log_date"] == today), None)

    return {"today": today_log, "history": history}


# ── Wellness plan ─────────────────────────────────────────────────────────────

@router.get("/plan/{emp_id}")
async def get_wellness_plan(emp_id: str, user: dict = Depends(get_current_user)):
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")
    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
  
    if not twin:
        return {"actions": [], "hr_stress": None, "hr_wlb": None,
                "hr_hours": None, "hr_wfh": None}

    burnout   = twin.get("burnout_score", 0)
    eff       = twin.get("efficiency", 70)
    dist_pct  = twin.get("distraction_pct", 0)
    ah_pct    = twin.get("after_hours_pct", 0)
    flow      = twin.get("focus_flow_state", False)
    risk      = twin.get("risk_level", "LOW")

    actions = []

    # After-hours work
    if ah_pct > 15:
        actions.append({
            "icon": "🌙", "category": "Work-Life Balance",
            "title": "Set a hard stop time today",
            "body":  f"{ah_pct:.0f}% of your activity happens outside core hours. "
                     "Try logging off at 6 PM and blocking your calendar.",
            "priority": "high",
        })

    # High distraction
    if dist_pct > 25:
        actions.append({
            "icon": "📵", "category": "Focus",
            "title": "Try a 25-min phone-free block",
            "body":  f"{dist_pct:.0f}% of events are distractions. "
                     "A short distraction-free Pomodoro can reset your focus baseline.",
            "priority": "high" if dist_pct > 40 else "medium",
        })

    # Low efficiency
    if eff < 50:
        actions.append({
            "icon": "🎯", "category": "Productivity",
            "title": "Identify your one most important task",
            "body":  "Your efficiency is lower than usual. "
                     "Pick a single high-value task and protect 90 minutes for it.",
            "priority": "medium",
        })

    # High burnout
    if burnout > 60:
        actions.append({
            "icon": "🌿", "category": "Recovery",
            "title": "Take a genuine break — not a scroll",
            "body":  f"Burnout score is {burnout:.0f}/100. "
                     "A 10-minute walk without your phone reduces cortisol measurably.",
            "priority": "high" if burnout > 75 else "medium",
        })

    # Flow state
    if flow:
        actions.append({
            "icon": "🚀", "category": "Flow",
            "title": "You're in flow — protect it",
            "body":  "Your activity pattern shows deep focus. "
                     "Decline non-urgent meetings and mute notifications for 2 more hours.",
            "priority": "low",
        })

    # Default positive action
    if eff >= 70 and burnout < 35:
        actions.append({
            "icon": "✨", "category": "Wellbeing",
            "title": "Share what's working",
            "body":  "You're performing well today. "
                     "Consider a quick async note to your team to share a tip.",
            "priority": "low",
        })

    # Breathing suggestion always present
    actions.append({
        "icon": "🌬️", "category": "Mindfulness",
        "title": "2-minute box breathing",
        "body":  "4 counts in — 4 hold — 4 out — 4 hold. "
                 "Three cycles lower your heart rate in under 90 seconds.",
        "priority": "low",
    })

    # Synthetic HR context (in production this would come from the HR system)
    hr_stress = round(burnout / 10, 1)
    hr_wlb    = round(max(1, 10 - burnout / 12), 1)
    hr_hours  = 40 + int(ah_pct / 3)
    hr_wfh    = 2

    return {
        "actions":   actions[:4],
        "hr_stress": hr_stress,
        "hr_wlb":    hr_wlb,
        "hr_hours":  hr_hours,
        "hr_wfh":    hr_wfh,
    }


# ── Weekly goals ──────────────────────────────────────────────────────────────

@router.get("/goals/{emp_id}")
async def get_wellness_goals(emp_id: str, user: dict = Depends(get_current_user)):
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")
    today  = datetime.utcnow()
    
    monday  = today - timedelta(days=today.weekday())
    week_start = monday.strftime("%Y-%m-%d")

    col = goals_col()
    docs = await col.find(
        {"emp_id": emp_id, "week_start": week_start},
        {"_id": 0}
    ).to_list(None)

    return {"goals": docs, "week_start": week_start}


@router.post("/goal")
async def upsert_wellness_goal(body: dict, user: dict = Depends(get_current_user)):
    emp_id    = body.get("emp_id", "").upper()
    goal_text = str(body.get("goal_text", "")).strip()[:200]
    goal_id   = body.get("goal_id")
    completed = body.get("completed", False)

    col = goals_col()
    today   = datetime.utcnow()
    monday  = today - timedelta(days=today.weekday())
    week_start = monday.strftime("%Y-%m-%d")

    # Toggle completion
    if goal_id is not None:
        await col.update_one(
            {"emp_id": emp_id, "id": goal_id},
            {"$set": {"completed": bool(completed)}},
        )
        return {"status": "updated"}

    # Add new goal
    count = await col.count_documents({"emp_id": emp_id, "week_start": week_start})
    if count >= 3:
        return {"status": "limit_reached"}

    new_id = int(datetime.utcnow().timestamp() * 1000) % 100000
    await col.insert_one({
        "emp_id":     emp_id,
        "week_start": week_start,
        "id":         new_id,
        "goal_text":  goal_text,
        "completed":  False,
        "created_at": datetime.utcnow(),
    })
    return {"status": "created", "id": new_id}


# ── Pomodoro sessions ─────────────────────────────────────────────────────────

@router.post("/pomodoro")
async def log_pomodoro(body: dict, user: dict = Depends(get_current_user)):
    emp_id       = body.get("emp_id", "").upper()
    duration_min = int(body.get("duration_min", 25))
    session_type = body.get("session_type", "work")
    today        = datetime.utcnow().strftime("%Y-%m-%d")

    col = pomodoro_col()
    await col.insert_one({
        "emp_id":       emp_id,
        "date":         today,
        "duration_min": duration_min,
        "session_type": session_type,
        "completed_at": datetime.utcnow(),
    })

    # Sum today's focus minutes
    pipeline = [
        {"$match": {"emp_id": emp_id, "date": today, "session_type": "work"}},
        {"$group": {"_id": None, "total": {"$sum": "$duration_min"}}},
    ]
    agg = await col.aggregate(pipeline).to_list(1)
    total = agg[0]["total"] if agg else duration_min

    return {"status": "logged", "focus_minutes_today": total}


@router.get("/pomodoro/{emp_id}/today")
async def pomodoro_today(emp_id: str, user: dict = Depends(get_current_user)):
    """Return today's total focus minutes for an employee."""
    emp_id = emp_id.upper()
    today  = datetime.utcnow().strftime("%Y-%m-%d")
    col    = pomodoro_col()
    pipeline = [
        {"$match": {"emp_id": emp_id, "date": today, "session_type": "work"}},
        {"$group": {"_id": None, "total": {"$sum": "$duration_min"}}},
    ]
    agg = await col.aggregate(pipeline).to_list(1)
    return {"focus_minutes_today": agg[0]["total"] if agg else 0}
