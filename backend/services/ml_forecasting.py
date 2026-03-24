"""services/ml_forecasting.py — Scikit-Learn LinearRegression for Burnout Forecasting"""
from __future__ import annotations
import numpy as np
from sklearn.linear_model import LinearRegression
from database import twin_history_col
from datetime import datetime

async def forecast_burnout(emp_id: str) -> dict:
    """
    Fits a LinearRegression model to historical burnout scores
    to predict the score 7 and 21 days into the future.
    """
    col = twin_history_col()
    
    # Fetch last 30 days, sorted historically (oldest to newest)
    history = await col.find(
        {"emp_id": emp_id}, 
        {"_id": 0, "timestamp": 1, "burnout_score": 1}
    ).sort("timestamp", 1).to_list(30)
    
    if len(history) < 7:
        return {
            "forecast_7d": None,
            "forecast_21d": None,
            "trend": "insufficient_data"
        }

    # Prepare data for Simple Linear Regression
    # X = Time (represented as array indices 0 to N-1)
    # y = Burnout Score
    X = np.arange(len(history)).reshape(-1, 1)
    y = np.array([day.get("burnout_score", 0) for day in history])
    
    model = LinearRegression()
    model.fit(X, y)
    
    # Predict the future
    # Tomorrow is index len(history)
    # 7 days from now is len(history) + 6
    # 21 days from now is len(history) + 20
    t_7d = np.array([[len(history) + 6]])
    t_21d = np.array([[len(history) + 20]])
    
    # Bound predictions between 0 and 100
    pred_7d = max(0, min(100, model.predict(t_7d)[0]))
    pred_21d = max(0, min(100, model.predict(t_21d)[0]))
    
    # Determine velocity/trend based on coefficient (slope)
    slope = model.coef_[0]
    velocity = float(slope)
    
    if velocity > 0.5:
        trend = "DETERIORATING" # Burnout is going up rapidly
    elif velocity < -0.5:
        trend = "IMPROVING" # Burnout is going down rapidly
    else:
        trend = "STABLE"

    return {
        "forecast_7d": round(pred_7d, 1),
        "forecast_21d": round(pred_21d, 1),
        "velocity": round(velocity, 3), # Score change per day
        "trend": trend,
        "current_score": y[-1]
    }
