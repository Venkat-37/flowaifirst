# routes/benchmarks.py
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
from services.benchmarks import get_industry_norms, get_all_industries
from middleware.auth import get_current_user, require_hr_manager
from database import twins_col

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])

@router.get("/industries")
async def list_industries():
    """Get a list of all available industries for benchmarking."""
    return {"industries": get_all_industries()}

@router.get("/org/summary")
async def org_benchmark_summary(user: dict = Depends(require_hr_manager)):
    """
    Aggregate org-level MBI proxy scores from digital_twins.
    
    Mapping rationale:
      EE proxy = after_hours_pct + switch_rate → high demand = high exhaustion
      CY proxy = distraction_pct + (100 - efficiency) → low engagement = cynicism  
      PE proxy = efficiency + focus_flow_state → high output = high efficacy
    All proxies are scaled to match MBI-GS raw score ranges.
    """
    twins = await twins_col().find(
        {}, 
        {"_id":0, "after_hours_pct":1, "switch_rate":1,
         "distraction_pct":1, "efficiency":1, "focus_flow_state":1,
         "burnout_score":1, "department":1}
    ).to_list(None)

    if not twins:
        return {"error": "No twin data"}

    n = len(twins)

    # Derive EE (0–36 scale): after_hours drives exhaustion most
    ee_scores = [
        (t.get("after_hours_pct", 0) / 100 * 22) +
        (t.get("switch_rate", 0) * 14)
        for t in twins
    ]
    # Derive CY (0–30 scale): distraction + low efficiency = cynicism/disengagement
    cy_scores = [
        (t.get("distraction_pct", 0) / 100 * 18) +
        ((100 - t.get("efficiency", 50)) / 100 * 12)
        for t in twins
    ]
    # Derive PE (0–30 scale): high efficiency + flow = high professional efficacy
    pe_scores = [
        (t.get("efficiency", 50) / 100 * 24) +
        (6 if t.get("focus_flow_state") else 0)
        for t in twins
    ]

    avg_ee = round(sum(ee_scores) / n, 1)
    avg_cy = round(sum(cy_scores) / n, 1)
    avg_pe = round(sum(pe_scores) / n, 1)

    from services.benchmarks import MBI_NORMS
    gen = MBI_NORMS["General"]

    return {
        "employee_count": n,
        "org_averages": {
            "exhaustion":            avg_ee,
            "cynicism":              avg_cy,
            "professional_efficacy": avg_pe,
            "burnout_composite":     round(sum(t.get("burnout_score",0) for t in twins) / n, 1),
        },
        "industry_norms": {
            "exhaustion":            gen["ee"]["mean"],
            "cynicism":              gen["cy"]["mean"],
            "professional_efficacy": gen["pa"]["mean"],
            "burnout_composite":     gen["burnout_composite"]["mean"],
        },
        "source": "telemetry_proxy"  # flag that this is derived, not from MBI surveys
    }

@router.get("/{industry}")
async def get_benchmarks(industry: str, user: dict = Depends(get_current_user)):
    """
    Get benchmark data for a specific industry.
    
    Args:
        industry: The industry name (e.g., "software_engineering")
    
    Returns:
        Dictionary with normative data for each MBI subscale.
    """
    norms = get_industry_norms(industry)
    if not norms:
        raise HTTPException(status_code=404, detail=f"Industry '{industry}' not found")
    
    return {
        "industry": industry,
        "norms": norms
    }
