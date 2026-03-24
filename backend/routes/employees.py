"""routes/employees.py — Employee list, stats, and individual activity."""
from __future__ import annotations
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from database import activity_col, employees_col, twins_col, behavior_col
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("")
async def list_employees(
    dept:     str | None = Query(None),
    risk:     str | None = Query(None),
    q:        str | None = Query(None),
    page:     int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Paginated, filterable employee list with twin stats."""
    col   = twins_col()
    query: dict = {}
    if dept: query["department"] = dept
    if risk: query["risk_level"]  = risk.upper()
    if q:
        if len(q) > 100:
            raise HTTPException(400, "Search query too long")
        pattern = re.compile(re.escape(q), re.IGNORECASE)
        query["$or"] = [{"emp_id": pattern}, {"department": pattern}]

    total   = await col.count_documents(query)
    skip    = (page - 1) * per_page
    cursor  = col.find(query, {"_id": 0}).sort("burnout_score", -1).skip(skip).limit(per_page)
    records = await cursor.to_list(per_page)

    # Distinct departments for filter UI
    depts = await twins_col().distinct("department")

    return {
        "employees":   records,
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "pages":       (total + per_page - 1) // per_page,
        "departments": sorted(depts),
    }


@router.get("/summary")
async def employees_summary(user: dict = Depends(get_current_user)):
    """Quick counts for dashboard header cards."""
    col = twins_col()
    pipeline = [
        {"$group": {
            "_id": "$risk_level",
            "count": {"$sum": 1},
            "avg_efficiency": {"$avg": "$efficiency"},
            "avg_burnout":    {"$avg": "$burnout_score"},
        }}
    ]
    buckets = await col.aggregate(pipeline).to_list(None)
    risk_map = {b["_id"]: b["count"] for b in buckets}

    total = await col.count_documents({})
    avg_eff = (
        sum(b["avg_efficiency"] * b["count"] for b in buckets) / max(total, 1)
    )
    avg_burn = (
        sum(b["avg_burnout"] * b["count"] for b in buckets) / max(total, 1)
    )
    return {
        "total_employees":  total,
        "avg_efficiency":   round(avg_eff, 1),
        "avg_burnout":      round(avg_burn, 1),
        "at_risk":          risk_map.get("HIGH", 0) + risk_map.get("CRITICAL", 0),
        "critical":         risk_map.get("CRITICAL", 0),
        "risk_distribution": risk_map,
    }


@router.get("/{emp_id}/stats")
async def employee_stats(emp_id: str, user: dict = Depends(get_current_user)):
    """Full stats for one employee."""
    emp_id = emp_id.upper()

    # Check access: employees can only see their own data
    if user.get("role") == "Employee" and user.get("emp_id") != emp_id:
        raise HTTPException(403, "Access denied")

    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    if not twin:
        raise HTTPException(404, f"No data found for {emp_id}")

    # Fetch recent activity logs
    logs = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(20).to_list(20)

    # Format timestamps
    for log in logs:
        if hasattr(log.get("timestamp"), "isoformat"):
            log["timestamp"] = log["timestamp"].isoformat()

    # Category breakdown
    pipeline = [
        {"$match": {"emp_id": emp_id}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]
    cat_agg = await activity_col().aggregate(pipeline).to_list(None)
    category_counts = {b["_id"]: b["count"] for b in cat_agg}

    # Top apps
    app_pipeline = [
        {"$match": {"emp_id": emp_id}},
        {"$group": {"_id": "$app_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 8},
    ]
    app_agg = await activity_col().aggregate(app_pipeline).to_list(None)
    top_apps = [{"app": b["_id"], "count": b["count"]} for b in app_agg]

    return {**twin, "logs": logs, "category_counts": category_counts, "top_apps": top_apps}


@router.get("/{emp_id}/activity")
async def employee_activity(
    emp_id: str,
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    """Raw activity feed for one employee."""
    emp_id = emp_id.upper()
    events = await activity_col().find(
        {"emp_id": emp_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)

    for e in events:
        if hasattr(e.get("timestamp"), "isoformat"):
            e["timestamp"] = e["timestamp"].isoformat()
    return events


@router.get("/{emp_id}/profile")
async def employee_profile(emp_id: str, user: dict = Depends(get_current_user)):
    """
    Full merged employee profile: digital twin + behavioral data.
    Returns activity-derived metrics alongside HR-sourced behavioral indicators.
    """
    emp_id = emp_id.upper()

    # Access control
    if user.get("role") == "Employee" and user.get("emp_id") != emp_id:
        raise HTTPException(403, "Access denied")

    twin = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
    behavior = await behavior_col().find_one({"emp_id": emp_id}, {"_id": 0})

    if not twin and not behavior:
        raise HTTPException(404, f"No data found for {emp_id}")

    # Merge — twin takes priority for computed fields
    profile = {**(behavior or {}), **(twin or {})}
    return profile
