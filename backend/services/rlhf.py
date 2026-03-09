"""services/rlhf.py — Reinforcement Learning from Human Feedback (RLHF).

Architecture:
  1. Every AI suggestion (observation, recommendation, plan action, actuation)
     can receive a thumbs-up or thumbs-down from the user it affected.
  2. Feedback is stored in the `rlhf_feedback` MongoDB collection.
  3. This module aggregates those signals into a "preference model" that
     is injected into subsequent Gemini prompts — gradually aligning the
     AI's behaviour with real human preferences.

The preference model works on suggestion_type buckets:
  - observation       (from AI Insight panel)
  - recommendation    (from AI Insight panel)
  - plan_action       (from Wellness Studio plan cards)
  - actuation         (from Digital Twin actuation triggers)

For each bucket we compute an "agreement_score" in [-1, 1]:
  +1 = consistently liked    (all thumbs up)
   0 = mixed or no data
  -1 = consistently disliked (all thumbs down)

This score is exposed via /api/feedback/rlhf-summary and can be injected
into Gemini prompts as a calibration header.
"""
from __future__ import annotations
from datetime import datetime


async def get_preference_summary(db) -> dict:
    """
    Compute the org-wide RLHF preference summary from stored feedback.
    Returns a dict suitable for injection into Gemini prompts.
    """
    col = db["rlhf_feedback"]

    # Aggregate by suggestion_type
    pipeline = [
        {
            "$group": {
                "_id":       "$suggestion_type",
                "thumbs_up": {"$sum": {"$cond": [{"$eq": ["$rating", 1]}, 1, 0]}},
                "thumbs_down": {"$sum": {"$cond": [{"$eq": ["$rating", -1]}, 1, 0]}},
                "total":     {"$sum": 1},
            }
        }
    ]
    rows = await col.aggregate(pipeline).to_list(None)

    buckets = {}
    for row in rows:
        up   = row["thumbs_up"]
        down = row["thumbs_down"]
        tot  = row["total"]
        score = (up - down) / max(tot, 1)           # in [-1, 1]
        buckets[row["_id"]] = {
            "thumbs_up":    up,
            "thumbs_down":  down,
            "total":        tot,
            "agreement_score": round(score, 3),
            "signal": (
                "well-received" if score >  0.4 else
                "mixed"         if score >= -0.2 else
                "poorly-received"
            ),
        }

    return {
        "computed_at": datetime.utcnow().isoformat() + "Z",
        "buckets": buckets,
        "prompt_hint": _build_prompt_hint(buckets),
    }


def _build_prompt_hint(buckets: dict) -> str:
    """
    Build a natural-language hint for the Gemini system prompt
    based on aggregated human feedback signals.
    """
    lines = []
    for stype, data in buckets.items():
        sig = data["signal"]
        if sig == "well-received":
            lines.append(
                f"- {stype.replace('_', ' ').capitalize()} suggestions have been "
                f"well-received ({data['thumbs_up']} 👍 vs {data['thumbs_down']} 👎). "
                "Continue generating similar suggestions."
            )
        elif sig == "poorly-received":
            lines.append(
                f"- {stype.replace('_', ' ').capitalize()} suggestions have been "
                f"poorly-received ({data['thumbs_up']} 👍 vs {data['thumbs_down']} 👎). "
                "Adjust your suggestions to be more specific, actionable, and less generic."
            )

    if not lines:
        return "No user feedback collected yet. Generate balanced, evidence-based suggestions."

    return (
        "HUMAN FEEDBACK CALIBRATION (RLHF signals from actual users):\n" +
        "\n".join(lines) +
        "\n\nAdjust your tone and specificity accordingly."
    )


async def build_calibrated_prompt_prefix(db) -> str:
    """
    Returns a prompt prefix containing RLHF calibration.
    Inject this at the start of any Gemini prompt to align with user preferences.
    """
    summary = await get_preference_summary(db)
    hint = summary.get("prompt_hint", "")
    if not hint:
        return ""
    return f"\n[RLHF CALIBRATION]\n{hint}\n[END CALIBRATION]\n\n"
