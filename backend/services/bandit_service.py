"""services/bandit_service.py — Contextual Multi-Armed Bandit (CMAB) for intervention selection.

Uses Thompson Sampling to learn which interventions (actions) are most effective 
for individual employees based on their context (RPC, burnout, etc.).
"""
from __future__ import annotations
import numpy as np
from datetime import datetime
from typing import List, Dict, Optional
from database import get_db
from database import bandit_stats_col

class InterventionBandit:
    """
    Thompson Sampling Bandit for learning optimal interventions.
    
    Each (employee, action) pair has a Beta distribution (alpha, beta) 
    representing the probability of 'success' (RPC improvement).
    """

    DEFAULT_ACTIONS = [
        "DO_NOT_DISTURB",
        "WELLNESS_CHECKIN",
        "BREATHING_EXERCISE",
        "BLOCK_CALENDAR",
        "REDUCE_MEETINGS"
    ]

    @staticmethod
    async def get_action(emp_id: str, context: dict) -> str:
        """
        Select an action for the employee using Thompson Sampling.
        """
        db = get_db()
        stats_col = bandit_stats_col()
        
        # Load or initialize stats for this employee
        employee_stats = await stats_col.find_one({"emp_id": emp_id})
        if not employee_stats:
            # Initialize with Neutral Priors (α=1, β=1)
            employee_stats = {
                "emp_id": emp_id,
                "actions": {a: {"alpha": 1.0, "beta": 1.0} for a in InterventionBandit.DEFAULT_ACTIONS}
            }
            await stats_col.insert_one(employee_stats)

        # Draw a sample from Beta(alpha, beta) for each action
        samples = {}
        for action, params in employee_stats["actions"].items():
            alpha = params.get("alpha", 1.0)
            beta = params.get("beta", 1.0)
            samples[action] = np.random.beta(alpha, beta)

        # Select action with the highest sample (Greedy choice from sampled distribution)
        best_action = max(samples, key=samples.get)
        return best_action

    @staticmethod
    async def update_reward(emp_id: str, action: str, reward: float):
        """
        Update the bandit model with the observed reward.
        reward = 1.0 (success/improvement) or 0.0 (failure/stagnation).
        """
        db = get_db()
        stats_col = db["bandit_stats"]
        
        # Increment alpha for success, beta for failure (Bernoulli Bandit)
        inc_field = f"actions.{action}.alpha" if reward > 0.5 else f"actions.{action}.beta"
        
        await stats_col.update_one(
            {"emp_id": emp_id},
            {"$inc": {inc_field: 1.0}},
            upsert=True
        )

# Module-level singleton
bandit_service = InterventionBandit()
