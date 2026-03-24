"""routes/insights.py — Gemini AI insight generation."""
from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Request
from database import activity_col, twins_col, insights_col
from middleware.auth import get_current_user
from models import InsightRequest
from services import gemini
from services.audit import log_event_bg, INSIGHT_GENERATE

router = APIRouter(prefix="/api/insights", tags=["insights"])

_CACHE_TTL_HOURS = 1  # Re-generate at most once per hour


@router.post("/generate")
async def generate_insight(req: InsightRequest, request: Request, user: dict = Depends(get_current_user)):
    """
    Generate (or return cached) AI insights for an employee or department.
    """
    col = insights_col()

    # Check cache
    if not req.force_refresh:
        cached = await col.find_one(
            {
                "target_id":   req.target_id,
                "target_type": req.target_type,
                "generated_at": {"$gte": datetime.utcnow() - timedelta(hours=_CACHE_TTL_HOURS)},
            },
            {"_id": 0},
        )
        if cached:
            if "generated_at" in cached:
                cached["generated_at"] = cached["generated_at"].isoformat()
            return {**cached, "cached": True}

    # Generate fresh insight
    try:
        if req.target_type == "employee":
            emp_id = req.target_id.upper()
            twin   = await twins_col().find_one({"emp_id": emp_id}, {"_id": 0})
            if not twin:
                return {"error": f"No twin found for {emp_id}"}

            # Get top apps
            app_pipeline = [
                {"$match": {"emp_id": emp_id}},
                {"$group": {"_id": "$app_name", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 6},
            ]
            app_agg  = await activity_col().aggregate(app_pipeline).to_list(None)
            top_apps = [b["_id"] for b in app_agg]

            result = await gemini.generate_employee_insight(emp_id, twin, top_apps)

        else:  # department
            dept_twin_docs = await twins_col().find(
                {"department": req.target_id}, {"_id": 0}
            ).to_list(None)
            result = await gemini.generate_department_insight(req.target_id, dept_twin_docs)
    except Exception as exc:
        print(f"  [!] ERROR generating insight: {exc}")
        import traceback
        traceback.print_exc()
        return {"error": str(exc)}

    # Persist
    doc = {
        "target_id":       req.target_id,
        "target_type":     req.target_type,
        "generated_at":    datetime.utcnow(),
        "model":           "gemini-2.0-flash",
        "observations":    result["observations"],
        "recommendations": result["recommendations"],
        "risk_summary":    result["risk_summary"],
        "raw_response":    result.get("raw_response", ""),
    }
    await col.replace_one(
        {"target_id": req.target_id, "target_type": req.target_type},
        doc,
        upsert=True,
    )

    doc.pop("raw_response", None)
    doc["generated_at"] = doc["generated_at"].isoformat()

    # Audit: log insight generation
    log_event_bg(
        INSIGHT_GENERATE,
        actor=user.get("sub", "unknown"), actor_role=user.get("role", "unknown"),
        target=req.target_id,
        details={"target_type": req.target_type, "cached": False,
                 "model": doc.get("model", "unknown")},
    )

    return {**doc, "cached": False}


@router.get("/employee/{emp_id}")
async def get_employee_insight(emp_id: str, user: dict = Depends(get_current_user)):
    """Return latest cached insight for an employee (no generation)."""
    col = insights_col()
    doc = await col.find_one(
        {"target_id": emp_id.upper(), "target_type": "employee"},
        {"_id": 0, "raw_response": 0},
    )
    if not doc:
        return {"observations": [], "recommendations": [], "risk_summary": "Not yet generated"}
    if "generated_at" in doc:
        doc["generated_at"] = doc["generated_at"].isoformat()
    return doc
