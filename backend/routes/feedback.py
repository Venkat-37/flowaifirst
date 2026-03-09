"""routes/feedback.py — RLHF: collect and expose human feedback on AI suggestions."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from middleware.auth import get_current_user
from services.rlhf import get_preference_summary

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("/rate")
async def submit_feedback(body: dict, user: dict = Depends(get_current_user)):
    """
    Submit a thumbs-up (+1) or thumbs-down (-1) rating for an AI suggestion.

    Required fields:
      emp_id          — who is giving feedback
      suggestion_type — observation | recommendation | plan_action | actuation
      suggestion_id   — stable identifier for the specific suggestion (free text)
      suggestion_text — the exact text of the suggestion being rated
      rating          — 1 (thumbs up) or -1 (thumbs down)

    Optional:
      context         — any extra context (e.g. which insight panel, trigger type)
    """
    emp_id          = str(body.get("emp_id", "")).upper()
    suggestion_type = str(body.get("suggestion_type", ""))
    suggestion_id   = str(body.get("suggestion_id", ""))
    suggestion_text = str(body.get("suggestion_text", ""))[:500]
    rating          = body.get("rating")
    context         = body.get("context", {})

    VALID_TYPES = {"observation", "recommendation", "plan_action", "actuation"}
    if suggestion_type not in VALID_TYPES:
        raise HTTPException(400, f"suggestion_type must be one of: {sorted(VALID_TYPES)}")
    if rating not in (1, -1):
        raise HTTPException(400, "rating must be 1 (thumbs up) or -1 (thumbs down)")
    if not suggestion_id:
        raise HTTPException(400, "suggestion_id is required")

    db = get_db()
    col = db["rlhf_feedback"]

    # One rating per (emp_id, suggestion_id) — upsert so users can change mind
    await col.update_one(
        {"emp_id": emp_id, "suggestion_id": suggestion_id},
        {"$set": {
            "emp_id":          emp_id,
            "suggestion_type": suggestion_type,
            "suggestion_id":   suggestion_id,
            "suggestion_text": suggestion_text,
            "rating":          rating,
            "context":         context,
            "rated_at":        datetime.utcnow(),
        }},
        upsert=True,
    )

    # Return updated counts for this suggestion so UI can refresh instantly
    up   = await col.count_documents({"suggestion_id": suggestion_id, "rating":  1})
    down = await col.count_documents({"suggestion_id": suggestion_id, "rating": -1})

    return {
        "status":      "rated",
        "rating":      rating,
        "thumbs_up":   up,
        "thumbs_down": down,
    }


@router.get("/suggestion/{suggestion_id}")
async def get_suggestion_ratings(suggestion_id: str, user: dict = Depends(get_current_user)):
    """Get current thumbs up/down counts for a specific suggestion."""
    db  = get_db()
    col = db["rlhf_feedback"]
    up   = await col.count_documents({"suggestion_id": suggestion_id, "rating":  1})
    down = await col.count_documents({"suggestion_id": suggestion_id, "rating": -1})
    return {"suggestion_id": suggestion_id, "thumbs_up": up, "thumbs_down": down}


@router.get("/my-rating/{suggestion_id}")
async def get_my_rating(suggestion_id: str, emp_id: str, user: dict = Depends(get_current_user)):
    """Get the calling user's rating for a specific suggestion."""
    db  = get_db()
    col = db["rlhf_feedback"]
    doc = await col.find_one(
        {"emp_id": emp_id.upper(), "suggestion_id": suggestion_id},
        {"_id": 0, "rating": 1}
    )
    return {"rating": doc["rating"] if doc else 0}


@router.get("/rlhf-summary")
async def rlhf_summary(user: dict = Depends(get_current_user)):
    """
    Return the org-wide RLHF preference summary.
    This is what gets injected into Gemini prompts to calibrate the AI.
    """
    db = get_db()
    return await get_preference_summary(db)


@router.get("/recent")
async def recent_feedback(user: dict = Depends(get_current_user)):
    """Return the 30 most recent feedback entries (for HR review)."""
    db  = get_db()
    col = db["rlhf_feedback"]
    docs = await col.find({}, {"_id": 0}).sort("rated_at", -1).limit(30).to_list(30)
    return {"feedback": docs}
