# services/ml_anomaly.py — fixed
"""services/ml_anomaly.py — Isolation Forest anomaly detection on twin history.

Detects abnormal behavioural patterns from a rolling 30-day window.
Uses seven features to detect cross-signal gaming contradictions:
  efficiency, burnout_score, cognitive_battery,
  title_entropy, temporal_consistency, idle_ratio, switch_rate
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest

from database import twin_history_col


async def detect_anomalies(emp_id: str) -> dict:
    """
    Detect abnormal behavioural patterns for one employee.

    Returns:
        {
            "anomaly_detected": bool,
            "confidence": float,       # 0.0 if no anomaly
            "reason": str,
            "features_used": list[str]
        }
    """
    col     = twin_history_col()
    history = await col.find(
        {"emp_id": emp_id},
        {
            "_id": 0, "snapped_at": 1,
            "efficiency": 1, "burnout_score": 1, "cognitive_battery": 1,
            "title_entropy": 1, "temporal_consistency": 1, "idle_ratio": 1, "switch_rate": 1
        },
    ).sort("snapped_at", -1).limit(30).to_list(30)

    features = [
        "efficiency", "burnout_score", "cognitive_battery", 
        "title_entropy", "temporal_consistency", "idle_ratio", "switch_rate"
    ]

    if len(history) < 14:
        return {
            "anomaly_detected": False,
            "confidence":       0.0,
            "reason":           f"Insufficient history — need 14 snapshots, have {len(history)}.",
            "features_used":    features,
        }

    # Feature matrix (7 dimensions)
    X = np.array([
        [
            d.get("efficiency",           0.0),
            d.get("burnout_score",        0.0),
            d.get("cognitive_battery",    100.0),
            d.get("title_entropy",        0.5), # default neutral
            d.get("temporal_consistency", 0.8), # default natural
            d.get("idle_ratio",           0.0),
            d.get("switch_rate",          0.0),
        ]
        for d in history
    ], dtype=np.float32)

    from sklearn.preprocessing import StandardScaler
    X_scaled = StandardScaler().fit_transform(X)

    model = IsolationForest(n_estimators=100, contamination="auto", random_state=42)
    model.fit(X_scaled)

    latest_scaled = X_scaled[0].reshape(1, -1)
    prediction = model.predict(latest_scaled)[0]   # 1 = normal, -1 = anomaly
    raw_score = model.score_samples(latest_scaled)[0]
    confidence  = float(max(0.0, min(1.0, -raw_score * 2)))

    if prediction != -1:
        return {"anomaly_detected": False, "confidence": 0.0, "reason": "",
                "features_used": features}

    # Explain why — compare against 30-day medians
    med_eff   = float(np.median(X[:, 0]))
    med_burn  = float(np.median(X[:, 1]))
    med_bat   = float(np.median(X[:, 2]))
    med_tent  = float(np.median(X[:, 3]))
    med_tcon  = float(np.median(X[:, 4]))
    med_idle  = float(np.median(X[:, 5]))
    med_swit  = float(np.median(X[:, 6]))

    curr_eff, curr_burn, curr_bat = float(X[0, 0]), float(X[0, 1]), float(X[0, 2])
    curr_tent, curr_tcon, curr_idle = float(X[0, 3]), float(X[0, 4]), float(X[0, 5])
    curr_swit = float(X[0, 6])
    reasons = []

    if curr_eff < med_eff - 15:
        reasons.append(
            f"Efficiency dropped sharply ({curr_eff:.1f}% vs {med_eff:.1f}% avg)."
        )
    if curr_burn > med_burn + 15:
        reasons.append(
            f"Burnout score spiked ({curr_burn:.1f} vs {med_burn:.1f} avg)."
        )
    if curr_bat < med_bat - 20:
        reasons.append(
            f"Cognitive battery depleted ({curr_bat:.1f} vs {med_bat:.1f} avg)."
        )
        
    # New gaming signal explanations
    if curr_tent < 0.3 and curr_eff > 80:
        reasons.append(f"Suspiciously low title entropy ({curr_tent:.2f}) alongside high efficiency.")
    if curr_tcon < 0.4:
        reasons.append(f"Highly unnatural temporal event distribution ({curr_tcon:.2f}).")
    if curr_idle > 0.5 and curr_eff > 80:
        reasons.append(f"High efficiency reported despite being idle for {curr_idle*100:.0f}% of session.")

    reason = (
        " ".join(reasons)
        if reasons
        else "Unusual combination of metrics detected by Isolation Forest."
    )

    return {
        "anomaly_detected": True,
        "confidence":       round(confidence, 2),
        "reason":           reason,
        "features_used":    features,
        "current":          {
            "efficiency": curr_eff, "burnout_score": curr_burn, "cognitive_battery": curr_bat,
            "title_entropy": curr_tent, "temporal_consistency": curr_tcon, "idle_ratio": curr_idle, "switch_rate": curr_swit
        },
        "30d_medians":      {
            "efficiency": med_eff, "burnout_score": med_burn, "cognitive_battery": med_bat,
            "title_entropy": med_tent, "temporal_consistency": med_tcon, "idle_ratio": med_idle, "switch_rate": med_swit
        },
    }