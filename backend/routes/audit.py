# routes/audit.py — fixed 
"""routes/audit.py — Audit log read access. HR Manager and Admin only."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from database import audit_col
from middleware.auth import require_hr_manager

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/log")
async def get_audit_log(
    event_type: str | None = Query(None, description="Filter by event type, e.g. auth.login"),
    actor:      str | None = Query(None, description="Filter by actor uid or emp_id"),
    target:     str | None = Query(None, description="Filter by target (partial match)"),
    hours:      int        = Query(24, ge=1, le=720),
    limit:      int        = Query(100, ge=1, le=500),
    user:       dict       = Depends(require_hr_manager),
):
    """Query audit log with filters. HR Manager / Admin only."""
    col   = audit_col()
    since = datetime.utcnow() - timedelta(hours=hours)

    query: dict = {"timestamp": {"$gte": since}}
    if event_type:
        query["event_type"] = event_type
    if actor:
        query["actor"] = actor
    if target:
        # re.escape() prevents ReDoS from user-supplied target strings
        query["target"] = {"$regex": re.escape(target), "$options": "i"}

    docs = await col.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    for d in docs:
        if isinstance(d.get("timestamp"), datetime):
            d["timestamp"] = d["timestamp"].isoformat()

    return {"total": len(docs), "events": docs}


@router.get("/summary")
async def audit_summary(
    hours: int = Query(24, ge=1, le=720),
    user:  dict = Depends(require_hr_manager),
):
    """Aggregated audit summary — event counts by type. HR Manager / Admin only."""
    col   = audit_col()
    since = datetime.utcnow() - timedelta(hours=hours)

    pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    agg = await col.aggregate(pipeline).to_list(None)

    total     = sum(a["count"] for a in agg)
    breakdown = {a["_id"]: a["count"] for a in agg}

    actors_pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$group": {"_id": "$actor"}},
    ]
    actors = await col.aggregate(actors_pipeline).to_list(None)

    return {
        "period_hours":  hours,
        "total_events":  total,
        "breakdown":     breakdown,
        "unique_actors": len(actors),
    }


@router.get("/timeline")
async def audit_timeline(
    hours: int = Query(24, ge=1, le=720),
    user:  dict = Depends(require_hr_manager),
):
    """Hourly event counts for timeline chart. HR Manager / Admin only."""
    col   = audit_col()
    since = datetime.utcnow() - timedelta(hours=hours)

    pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$group": {
            "_id":   {"hour": {"$hour": "$timestamp"}, "day": {"$dayOfMonth": "$timestamp"}},
            "count": {"$sum": 1},
            "types": {"$addToSet": "$event_type"},
        }},
        {"$sort": {"_id.day": 1, "_id.hour": 1}},
    ]
    agg = await col.aggregate(pipeline).to_list(None)

    timeline = [
        {
            "hour":  f"{a['_id']['day']}-{a['_id']['hour']:02d}:00",
            "count": a["count"],
            "types": a["types"],
        }
        for a in agg
    ]

    return {"period_hours": hours, "timeline": timeline}