# routes/reports.py
"""routes/reports.py — Export endpoints: CSV, Excel, PDF.

Three report types:
  GET /api/reports/employee/{emp_id}.csv   — individual summary
  GET /api/reports/department/{dept}.csv   — department summary
  GET /api/reports/org.csv                 — full org export

PDF generation uses reportlab (already in requirements).
Excel uses openpyxl (add to requirements.txt).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from database import twins_col, employees_col
from middleware.auth import get_current_user, require_hr_manager, owns_employee_data
from services.privacy import add_dp_noise

router = APIRouter(prefix="/api/reports", tags=["reports"])

_TWIN_FIELDS = {
    "_id": 0, "emp_id": 1, "department": 1,
    "efficiency": 1, "burnout_score": 1, "cognitive_battery": 1,
    "risk_level": 1, "after_hours_pct": 1, "distraction_pct": 1,
    "switch_rate": 1, "focus_flow_state": 1, "last_updated": 1,
}

def _noise_twin(twin: dict, n: int = 1) -> dict:
    """Helper to add DP noise to an exported twin document."""
    res = dict(twin)
    for field in ["efficiency", "burnout_score", "cognitive_battery", "after_hours_pct", "distraction_pct"]:
        if field in res and isinstance(res[field], (int, float)):
            res[field] = add_dp_noise(res[field], sensitivity=100.0/max(n, 1))
            
    if "switch_rate" in res and isinstance(res["switch_rate"], (int, float)):
        res["switch_rate"] = round(max(0.0, add_dp_noise(res["switch_rate"] * 100, sensitivity=100.0/max(n, 1)) / 100.0), 3)
        
    return res


# ── Employee CSV ───────────────────────────────────────────────────────────────

@router.get("/employee/{emp_id}.csv")
async def export_employee_csv(emp_id: str, user: dict = Depends(get_current_user)):
    """Export one employee's twin data as CSV."""
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")

    twin = await twins_col().find_one({"emp_id": emp_id}, _TWIN_FIELDS)
    if not twin:
        raise HTTPException(404, f"No data for {emp_id}")

    twin = _noise_twin(twin)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Field", "Value"])
    for key, val in twin.items():
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        writer.writerow([key, val])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={emp_id}_report.csv"},
    )


# ── Department CSV ─────────────────────────────────────────────────────────────

@router.get("/department/{dept}.csv")
async def export_department_csv(dept: str, user: dict = Depends(require_hr_manager)):
    """Export all employees in a department as CSV. HR only."""
    import re

    twins = await twins_col().find(
        {"department": {"$regex": f"^{re.escape(dept)}$", "$options": "i"}},
        _TWIN_FIELDS,
    ).sort("burnout_score", -1).to_list(500)

    if not twins:
        raise HTTPException(404, f"No employees in department '{dept}'")

    output   = io.StringIO()
    headers  = [
        "emp_id", "department", "risk_level",
        "burnout_score", "efficiency", "cognitive_battery",
        "after_hours_pct", "distraction_pct", "switch_rate",
        "focus_flow_state", "last_updated",
    ]
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    n = len(twins)
    for t in twins:
        t = _noise_twin(t, n)
        if hasattr(t.get("last_updated"), "isoformat"):
            t["last_updated"] = t["last_updated"].isoformat()
        writer.writerow(t)

    output.seek(0)
    fname = f"{dept.replace(' ', '_')}_report_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ── Org-wide CSV ───────────────────────────────────────────────────────────────

@router.get("/org.csv")
async def export_org_csv(user: dict = Depends(require_hr_manager)):
    """Export all employees org-wide as CSV. HR only."""
    twins = await twins_col().find({}, _TWIN_FIELDS).sort("department", 1).to_list(None)
    if not twins:
        raise HTTPException(404, "No twin data available")

    output  = io.StringIO()
    headers = [
        "emp_id", "department", "risk_level",
        "burnout_score", "efficiency", "cognitive_battery",
        "after_hours_pct", "distraction_pct", "switch_rate",
        "focus_flow_state", "last_updated",
    ]
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    n = len(twins)
    for t in twins:
        t = _noise_twin(t, n)
        if hasattr(t.get("last_updated"), "isoformat"):
            t["last_updated"] = t["last_updated"].isoformat()
        writer.writerow(t)

    output.seek(0)
    fname = f"flowai_org_report_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )