"""routes/audit.py — Audit log analytics endpoints for HR Managers."""
from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from database import get_db
from middleware.auth import require_hr_manager

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/log")
async def get_audit_log(
    event_type: str = Query(None, description="Filter by event type, e.g. auth.login"),
    actor: str = Query(None, description="Filter by actor (google_uid or emp_id)"),
    target: str = Query(None, description="Filter by target"),
    hours: int = Query(24, description="Look back N hours"),
    limit: int = Query(100, le=500),
    user: dict = Depends(require_hr_manager),
):
    """Query audit log with filters. HR Manager only."""
    col = get_db()["audit_log"]

    query = {"timestamp": {"$gte": datetime.utcnow() - timedelta(hours=hours)}}
    if event_type:
        query["event_type"] = event_type
    if actor:
        query["actor"] = actor
    if target:
        query["target"] = {"$regex": target, "$options": "i"}

    docs = await col.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    # Convert datetimes
    for d in docs:
        if "timestamp" in d:
            d["timestamp"] = d["timestamp"].isoformat()

    return {"total": len(docs), "events": docs}


@router.get("/summary")
async def audit_summary(
    hours: int = Query(24),
    user: dict = Depends(require_hr_manager),
):
    """Aggregated audit summary — counts by event type. HR Manager only."""
    col = get_db()["audit_log"]
    since = datetime.utcnow() - timedelta(hours=hours)

    pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    agg = await col.aggregate(pipeline).to_list(None)

    total = sum(a["count"] for a in agg)
    breakdown = {a["_id"]: a["count"] for a in agg}

    # Recent unique actors
    actors_pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$group": {"_id": "$actor"}},
    ]
    actors = await col.aggregate(actors_pipeline).to_list(None)

    return {
        "period_hours": hours,
        "total_events": total,
        "breakdown":    breakdown,
        "unique_actors": len(actors),
    }


@router.get("/timeline")
async def audit_timeline(
    hours: int = Query(24),
    user: dict = Depends(require_hr_manager),
):
    """Hourly event counts for timeline chart. HR Manager only."""
    col = get_db()["audit_log"]
    since = datetime.utcnow() - timedelta(hours=hours)

    pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$group": {
            "_id": {
                "hour": {"$hour": "$timestamp"},
                "day":  {"$dayOfMonth": "$timestamp"},
            },
            "count": {"$sum": 1},
            "types": {"$addToSet": "$event_type"},
        }},
        {"$sort": {"_id.day": 1, "_id.hour": 1}},
    ]
    agg = await col.aggregate(pipeline).to_list(None)

    timeline = [{"hour": f"{a['_id']['day']}-{a['_id']['hour']:02d}:00",
                 "count": a["count"], "types": a["types"]} for a in agg]

    return {"period_hours": hours, "timeline": timeline}
