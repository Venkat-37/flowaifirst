# services/benchmarks.py
from typing import Dict, Any

# Industry normative data for MBI scores
# Format: {industry: {subscale: {mean: float, sd: float}}}
INDUSTRY_NORMS = {
    "software_engineering": {
        "exhaustion": {"mean": 13.2, "sd": 6.8},
        "cynicism": {"mean": 7.1, "sd": 5.4},
        "professional_efficacy": {"mean": 24.3, "sd": 5.1}
    },
    "healthcare": {
        "exhaustion": {"mean": 15.8, "sd": 7.2},
        "cynicism": {"mean": 8.3, "sd": 6.1},
        "professional_efficacy": {"mean": 22.1, "sd": 5.8}
    },
    "finance": {
        "exhaustion": {"mean": 12.5, "sd": 6.5},
        "cynicism": {"mean": 6.9, "sd": 5.2},
        "professional_efficacy": {"mean": 25.0, "sd": 4.9}
    },
    "education": {
        "exhaustion": {"mean": 16.2, "sd": 7.5},
        "cynicism": {"mean": 8.7, "sd": 6.3},
        "professional_efficacy": {"mean": 21.8, "sd": 5.7}
    },
    "consulting": {
        "exhaustion": {"mean": 14.7, "sd": 7.0},
        "cynicism": {"mean": 7.8, "sd": 5.8},
        "professional_efficacy": {"mean": 23.5, "sd": 5.3}
    }
}

MBI_NORMS = {
    "General": {
        "ee": {"mean": 14.5, "sd": 7.0},
        "cy": {"mean": 7.5, "sd": 5.5},
        "pa": {"mean": 23.0, "sd": 5.0},
        "burnout_composite": {"mean": 45.0, "sd": 15.0}
    }
}

def get_industry_norms(industry: str) -> Dict[str, Dict[str, float]]:
    """
    Get the normative data (mean and standard deviation) for an industry.
    
    Args:
        industry: The industry name (e.g., "software_engineering")
    
    Returns:
        Dictionary with subscale names as keys and norm data as values.
        If industry not found, returns None.
    """
    return INDUSTRY_NORMS.get(industry.lower())

def get_all_industries() -> list:
    """Return a list of all available industries."""
    return list(INDUSTRY_NORMS.keys())
