"""middleware/privacy.py — Privacy protection layer for data anonymization."""
import hmac
import hashlib
from config import get_settings

def _hash_emp(emp_id: str) -> str:
    key = get_settings().anon_hmac_key
    if not key:
        key = "flowai-default-anon-key"
    token = hmac.new(key.encode(), emp_id.encode(), hashlib.sha256).hexdigest()[:8].upper()
    return f"EMP-{token}"

def anonymize_twin_data(data, user_role: str):
    """
    If the user_role is not 'HR Manager', mask sensitive fields like emp_id.
    Supports single dicts, list of dicts, or specifically structured org/analytics summaries.
    """
    if user_role == "HR Manager" or user_role == "Employee":
        return data

    def mask_item(item: dict) -> dict:
        masked = item.copy()
        if "emp_id" in masked and masked["emp_id"]:
            masked["emp_id"] = _hash_emp(masked["emp_id"])
        if "name" in masked:
            masked["name"] = "Anonymized"
        if "email" in masked:
            del masked["email"]
        return masked

    if isinstance(data, list):
        return [mask_item(d) for d in data]
    elif isinstance(data, dict):
        result = data.copy()
        # For org summary endpoints
        if "top_at_risk" in result:
            result["top_at_risk"] = [mask_item(d) for d in result["top_at_risk"]]
        
        # For risk trend endpoints
        if "at_risk_trend" in result:
            result["at_risk_trend"] = [mask_item(d) for d in result["at_risk_trend"]]

        # If it's just a raw twin dict
        if "emp_id" in result and "top_at_risk" not in result:
            return mask_item(result)
            
        return result
        
    return data
