# routes/mbi_survey.py
"""routes/mbi_survey.py — MBI-GS survey endpoints for employees.

Gives employees the self-report questionnaire and surfaces scored results.
Works alongside services/scoring.py (telemetry-based) — the two approaches
validate each other. Correlation endpoint measures how well the telemetry
model predicts the validated psychological instrument.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user, require_hr_manager, owns_employee_data
from services.mbi_survey import MBISurvey

router = APIRouter(prefix="/api/mbi", tags=["mbi_survey"])


@router.get("/structure")
async def get_survey_structure(user: dict = Depends(get_current_user)):
    """
    Return the MBI-GS questionnaire structure for the frontend to render.
    All authenticated users can fetch this (it contains no personal data).
    """
    emp_id = user.get("emp_id", "anonymous")
    survey = MBISurvey(employee_id=emp_id)
    return survey.get_survey_structure()


@router.post("/submit")
async def submit_survey(body: dict, user: dict = Depends(get_current_user)):
    """
    Submit a completed MBI-GS survey.
    Employees submit for themselves only.
    Returns scored result immediately — no waiting.
    """
    emp_id = (user.get("emp_id") or "").upper()
    if not emp_id:
        raise HTTPException(400, "No employee record linked to this account.")

    responses = body.get("responses")
    if not responses or not isinstance(responses, dict):
        raise HTTPException(400, "responses dict is required: {question_id: score (0-6)}")

    try:
        survey = MBISurvey(employee_id=emp_id)
        result = await survey.submit_response(responses)
    except ValueError as e:
        raise HTTPException(422, str(e))

    return result


@router.get("/history/{emp_id}")
async def get_survey_history(emp_id: str, user: dict = Depends(get_current_user)):
    """
    Return MBI survey history for one employee.
    Employee can view their own; HR can view anyone's.
    """
    emp_id = emp_id.upper()
    if not owns_employee_data(user, emp_id):
        raise HTTPException(403, "Access denied")

    records = await MBISurvey.get_responses(emp_id, limit=30)
    return {"emp_id": emp_id, "count": len(records), "surveys": records}


@router.get("/correlation/org")
async def get_org_telemetry_correlation(user: dict = Depends(require_hr_manager)):
    """
    Cross-sectional Pearson correlation between the *latest* MBI Composite Z-score 
    and the *latest* telemetry burnout score for all employees in the organization.
    HR only — this provides model validation at an organizational level.
    """
    result = await MBISurvey.calculate_cross_sectional_correlation()
    return result


@router.get("/correlation/{emp_id}")
async def get_telemetry_correlation(emp_id: str, user: dict = Depends(require_hr_manager)):
    """
    Pearson correlation between MBI exhaustion scores and switch rate telemetry.
    HR only — this is a model validation endpoint, not a personal metric.
    """
    emp_id = emp_id.upper()
    result = await MBISurvey.correlate_with_telemetry(emp_id)
    return result