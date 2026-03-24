# services/mbi_survey.py — fixed (5 bugs corrected)
"""services/mbi_survey.py — MBI-GS validated burnout survey.

Complements services/scoring.py:
  scoring.py    = continuous inference from behavioural telemetry
  mbi_survey.py = periodic self-report via validated 16-question instrument

Fixes applied vs previous version:
  1. mbi_responses_col imported correctly
  2. get_responses_for_validation reads MongoDB, not flat file
  3. calculate_correlation_with_telemetry made async and functional
  4. __main__ block removed (not production code)
  5. exhaustion_scores extraction uses correct nested key path
"""
from __future__ import annotations

import math
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from database import mbi_responses_col, activity_col   # FIX 1: correct import


class BurnoutLevel(Enum):
    LOW      = "low_risk"
    MODERATE = "medium_risk"
    HIGH     = "high_risk"


class MBISurvey:
    """Maslach Burnout Inventory — General Survey (MBI-GS, 16 questions, 3 sub-scales)."""

    QUESTIONS = {
        "exhaustion": [
            {"id": "I1", "text": "I feel emotionally drained from my work."},
            {"id": "I2", "text": "I feel fatigued when I wake up and have to face another day on the job."},
            {"id": "I3", "text": "Working directly with people is too stressful for me."},
            {"id": "I4", "text": "I feel frustrated by my work."},
            {"id": "I5", "text": "Working with people all day is really a strain for me."},
            {"id": "I6", "text": "I feel I am at the end of my rope."},
        ],
        "cynicism": [
            {"id": "C1", "text": "I have become more callous toward people since I took this job."},
            {"id": "C2", "text": "I worry that this job is hardening me emotionally."},
            {"id": "C3", "text": "I do not really care what happens to some people at work."},
            {"id": "C4", "text": "I have become more cynical about whether my work contributes anything meaningful."},
            {"id": "C5", "text": "I feel detached from my work."},
        ],
        "professional_efficacy": [
            {"id": "PE1", "text": "I have accomplished many worthwhile things in this job."},
            {"id": "PE2", "text": "I can effectively solve the problems that arise in my work."},
            {"id": "PE3", "text": "I feel I am working too hard on my job."},
            {"id": "PE4", "text": "I can easily create a relaxed atmosphere with my coworkers."},
            {"id": "PE5", "text": "I feel energized when I accomplish something at work."},
        ],
    }

    NORMS = {
        "exhaustion":            {"mean": 12.1, "sd": 7.9},
        "cynicism":              {"mean": 6.8,  "sd": 6.2},
        "professional_efficacy": {"mean": 25.1, "sd": 5.4},
    }

    SCALE_LABELS = {
        "0": "Never", "1": "A few times a year or less",
        "2": "Once a month or less", "3": "A few times a month",
        "4": "Once a week", "5": "A few times a week", "6": "Every day",
    }

    def __init__(self, employee_id: str):
        self.employee_id = employee_id

    # ── Public API ────────────────────────────────────────────────────────────

    def get_survey_structure(self) -> dict:
        """Return full survey structure for the frontend to render."""
        return {
            "survey_name":      "Maslach Burnout Inventory — General Survey (MBI-GS)",
            "version":          "validated_1995",
            "description":      "16-question validated assessment across 3 dimensions",
            "duration_minutes": 5,
            "scale":            self.SCALE_LABELS,
            "subscales": {
                "exhaustion":          {"name": "Emotional Exhaustion", "range": "0-36"},
                "cynicism":            {"name": "Cynicism",             "range": "0-30"},
                "professional_efficacy": {"name": "Professional Efficacy", "range": "0-30"},
            },
            "questions":        self.QUESTIONS,
            "consent_reminder": "Your responses are anonymised and used only to validate FlowAI's wellness model.",
        }

    async def submit_response(self, responses: Dict[str, int]) -> dict:
        """
        Validate, score, and persist MBI-GS responses to MongoDB.
        Returns the complete scored record.
        """
        if not self._validate(responses):
            raise ValueError(
                "Invalid responses — all 16 questions must be answered with scores 0-6"
            )

        raw     = self._raw_scores(responses)
        z       = self._z_scores(raw)
        level   = self._classify(z)
        comp_z  = (z["exhaustion"] + z["cynicism"] - z["professional_efficacy"]) / 3.0
        pct     = round(50 * (1 + math.erf(comp_z / math.sqrt(2))), 1)

        record = {
            "employee_id":  self.employee_id,
            "survey_type":  "MBI-GS",
            "submitted_at": datetime.utcnow(),
            "responses":    responses,
            "scores": {
                "raw":         raw,    # FIX 5: correct structure — raw scores nested under "raw"
                "z_scores":    z,
                "composite_z": round(comp_z, 2),
                "percentile":  pct,
            },
            "classification": {
                "burnout_level":       level.value,
                "recommendation":      self._recommendation(level),
                "scientific_grounding": "Z-normalised against Schaufeli 1996 norms",
            },
        }

        await mbi_responses_col().insert_one(record)  # FIX 1: uses imported helper
        record.pop("_id", None)
        return record

    # ── Static helpers ────────────────────────────────────────────────────────

    def _validate(self, responses: Dict[str, int]) -> bool:
        required = {q["id"] for qs in self.QUESTIONS.values() for q in qs}
        if set(responses.keys()) != required:
            return False
        return all(isinstance(v, (int, float)) and 0 <= v <= 6 for v in responses.values())

    def _raw_scores(self, responses: Dict[str, int]) -> Dict[str, int]:
        return {
            sub: sum(responses.get(q["id"], 0) for q in qs)
            for sub, qs in self.QUESTIONS.items()
        }

    def _z_scores(self, raw: Dict[str, int]) -> Dict[str, float]:
        return {
            sub: round((raw[sub] - norm["mean"]) / norm["sd"], 2)
            for sub, norm in self.NORMS.items()
        }

    def _classify(self, z: Dict[str, float]) -> BurnoutLevel:
        avg = (z["exhaustion"] + z["cynicism"] - z["professional_efficacy"]) / 3.0
        if avg > 1.0:  return BurnoutLevel.HIGH
        if avg > 0.0:  return BurnoutLevel.MODERATE
        return BurnoutLevel.LOW

    @staticmethod
    def _recommendation(level: BurnoutLevel) -> str:
        return {
            BurnoutLevel.LOW:      "Burnout risk is low. Current work patterns are sustainable.",
            BurnoutLevel.MODERATE: "Moderate burnout signals. Consider stress-reduction strategies.",
            BurnoutLevel.HIGH:     "High burnout risk. HR support or EAP consultation recommended.",
        }[level]

    # ── Read helpers ──────────────────────────────────────────────────────────

    @staticmethod
    async def get_responses(employee_id: str, limit: int = 30) -> List[dict]:
        """Fetch recent MBI responses from MongoDB."""  # FIX 2: MongoDB, not flat file
        cursor = mbi_responses_col().find(
            {"employee_id": employee_id},
            {"_id": 0},
        ).sort("submitted_at", -1).limit(limit)
        return await cursor.to_list(limit)

    @staticmethod
    async def correlate_with_telemetry(employee_id: str) -> dict:
        """
        Pearson correlation between MBI exhaustion z-scores and app switch rate.
        Requires at least 3 survey responses with matching telemetry dates.
        """  # FIX 3: actually implemented, async, MongoDB-backed
        from scipy import stats
        import numpy as np

        records = await MBISurvey.get_responses(employee_id, limit=30)
        if len(records) < 3:
            return {
                "employee_id":      employee_id,
                "status":           "insufficient_data",
                "surveys_count":    len(records),
                "message":          "Need at least 3 completed surveys for correlation analysis.",
            }

        # FIX 5 usage: correct key path is scores.z_scores.exhaustion
        ee_z_scores, switch_rates = [], []
        for rec in records:
            date_str = rec["submitted_at"].strftime("%Y-%m-%d") if hasattr(rec["submitted_at"], "strftime") else rec["submitted_at"][:10]
            ee_z = rec.get("scores", {}).get("z_scores", {}).get("exhaustion")
            if ee_z is None:
                continue

            # Match activity events from the same date
            start = datetime.strptime(date_str, "%Y-%m-%d")
            end   = start.replace(hour=23, minute=59, second=59)
            events = await activity_col().find(
                {"emp_id": employee_id, "timestamp": {"$gte": start, "$lte": end}},
                {"_id": 0, "category": 1},
            ).to_list(None)

            if not events:
                continue

            cats     = [e.get("category", "") for e in events]
            switches = sum(1 for i in range(1, len(cats)) if cats[i] != cats[i - 1])
            rate     = switches / max(len(cats) - 1, 1)
            ee_z_scores.append(ee_z)
            switch_rates.append(rate)

        if len(ee_z_scores) < 3:
            return {"employee_id": employee_id, "status": "insufficient_paired_data",
                    "paired_count": len(ee_z_scores)}

        r, p = stats.pearsonr(ee_z_scores, switch_rates)
        return {
            "employee_id":               employee_id,
            "status":                    "complete",
            "exhaustion_vs_switch_rate": round(r, 3),
            "p_value":                   round(p, 4),
            "paired_observations":       len(ee_z_scores),
            "interpretation": (
                "Strong positive correlation — high switch rate reliably predicts exhaustion."
                if r > 0.6 else
                "Moderate correlation." if r > 0.3 else
                "Weak correlation — more data needed."
            ),
        }

    @staticmethod
    async def calculate_cross_sectional_correlation() -> dict:
        """
        Cross-sectional Pearson correlation across all employees.
        Plots the *latest* MBI Composite Z-score against their *latest* Telemetry Burnout Score.
        """
        from scipy import stats
        from database import get_db

        db = get_db()
        mbi_col = db["mbi_responses"]
        twins_col = db["digital_twins"]

        # 1. Get the latest MBI composite z-score per employee
        # Group by employee_id, sort by submitted_at desc, take first
        pipeline = [
            {"$sort": {"submitted_at": -1}},
            {"$group": {
                "_id": "$employee_id",
                "composite_z": {"$first": "$scores.composite_z"}
            }}
        ]
        mbi_latest = await mbi_col.aggregate(pipeline).to_list(None)
        
        if not mbi_latest:
            return {"status": "insufficient_data", "message": "No MBI surveys found."}

        # 2. Match with latest twin burnout score
        paired_data = []
        composite_z_arr = []
        burnout_arr = []

        for row in mbi_latest:
            emp_id = row["_id"]
            z_val = row.get("composite_z")
            if z_val is None:
                continue

            twin = await twins_col.find_one({"emp_id": emp_id}, {"burnout_score": 1, "department": 1, "_id": 0})
            if not twin or "burnout_score" not in twin:
                continue
            
            b_score = twin["burnout_score"]
            composite_z_arr.append(z_val)
            burnout_arr.append(b_score)
            
            paired_data.append({
                "emp_id": emp_id,
                "composite_z": z_val,
                "burnout_score": round(b_score, 1),
                "department": twin.get("department", "Unknown")
            })

        if len(paired_data) < 3:
            return {
                "status": "insufficient_paired_data",
                "paired_count": len(paired_data),
                "message": "Need at least 3 employees with both an MBI survey and a Digital Twin."
            }

        r, p = stats.pearsonr(burnout_arr, composite_z_arr)
        
        return {
            "status": "complete",
            "pearson_r": round(r, 3),
            "p_value": round(p, 4),
            "paired_observations": len(paired_data),
            "scatter_data": paired_data,
            "interpretation": (
                "Strong positive validation — Telemetry correctly mirrors clinical MBI."
                if r > 0.6 else
                "Moderate validation — Telemetry partially catches MBI signs." if r > 0.3 else
                "Weak validation — Model requires retuning or more training data."
            ),
        }