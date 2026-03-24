"""services/gemini.py — AI insights with 3-tier fallback: Gemini → Groq → Local Rules."""
from __future__ import annotations
import json
import re
import time
import asyncio
import os
from config import get_settings

_model = None


def _get_model():
    global _model
    if _model is None:
        import google.generativeai as genai
        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY not configured in .env")
        genai.configure(api_key=settings.gemini_api_key)
        _model = genai.GenerativeModel("gemini-2.0-flash")
    return _model


async def _call_with_retry(model, prompt, max_retries: int = 2):
    """Call Gemini with exponential backoff on 429 / ResourceExhausted errors."""
    from google.api_core.exceptions import ResourceExhausted

    last_err = None
    for attempt in range(max_retries + 1):
        try:
            return model.generate_content(prompt)
        except ResourceExhausted as e:
            last_err = e
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)           # 2 s, 4 s
                print(f"  [RETRY] Gemini 429 — retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait)
            else:
                raise
        except Exception:
            raise                                    # non-retryable → surface immediately


# ── Groq fallback (free Llama3) ──────────────────────────────────────────────

async def _call_groq(prompt: str) -> dict:
    """Call Groq's free Llama3 API as Gemini fallback."""
    import httpx
    api_key = get_settings().groq_api_key if hasattr(get_settings(), 'groq_api_key') else os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise RuntimeError("No GROQ_API_KEY configured")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": 512,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        raw = data["choices"][0]["message"]["content"]
        return json.loads(raw)


# ── Local rule-based fallback (zero API) ─────────────────────────────────────

def _generate_local_insight(stats: dict) -> dict:
    """Generate smart insights from twin data using rule-based analysis.
    Works completely offline — no API needed."""
    burnout     = stats.get("burnout_score", 0)
    efficiency  = stats.get("efficiency", 0)
    risk        = stats.get("risk_level", "LOW")
    battery     = stats.get("cognitive_battery", 100)
    distraction = stats.get("distraction_pct", 0)
    after_hours = stats.get("after_hours_pct", 0)
    switch_rate = stats.get("switch_rate_pct", 0)
    focus_flow  = stats.get("focus_flow_state", False)
    dept        = stats.get("department", "Unknown")

    observations = []
    recommendations = []

    # Burnout analysis
    if burnout >= 75:
        observations.append(f"Critical burnout level detected at {burnout:.0f}/100 — this employee needs immediate attention. Sustained levels above 70 are associated with a 3x increase in turnover risk.")
        recommendations.append("Schedule a 1:1 wellness check-in within 24 hours. Consider redistributing workload and enabling Do Not Disturb mode.")
    elif burnout >= 50:
        observations.append(f"Elevated burnout score of {burnout:.0f}/100 suggests accumulating fatigue. Without intervention, this is projected to reach critical levels within 2-3 weeks.")
        recommendations.append("Introduce micro-recovery periods: 10-minute breaks between deep work sessions. Monitor weekly trend for escalation.")
    elif burnout >= 30:
        observations.append(f"Burnout score of {burnout:.0f}/100 is within moderate range. Current work patterns are sustainable but approaching caution thresholds.")
    else:
        observations.append(f"Healthy burnout score of {burnout:.0f}/100 indicates good work-life balance and sustainable productivity patterns.")

    # Efficiency vs distraction tension
    if efficiency >= 70:
        observations.append(f"Strong efficiency at {efficiency:.0f}% — this employee is in the top quartile for productive output. {f'Currently in Focus Flow state.' if focus_flow else ''}")
    elif efficiency < 50 and distraction > 25:
        observations.append(f"Efficiency ({efficiency:.0f}%) is being dragged down by a {distraction:.0f}% distraction rate. Context switching is likely fragmenting deep work sessions.")
        recommendations.append("Review and reduce notification sources during work hours. Consider implementing structured communication windows.")
    elif efficiency < 50:
        observations.append(f"Below-average efficiency at {efficiency:.0f}% may indicate task complexity, tool friction, or unclear priorities rather than lack of effort.")

    # After-hours concern
    if after_hours > 20:
        observations.append(f"After-hours activity at {after_hours:.0f}% is a leading indicator of burnout. Consistent overtime degrades cognitive performance within 3-4 weeks.")
        recommendations.append("Enforce work-hour boundaries. Flag to the manager if deadlines are driving overtime — it's an organisational problem, not an individual one.")

    # Context switching
    if switch_rate > 30:
        recommendations.append(f"Context switch rate of {switch_rate:.0f}% is high. Each switch costs ~23 minutes of refocus time. Batch similar tasks together.")

    # Cognitive battery
    if battery < 30:
        observations.append(f"Cognitive battery at {battery:.0f}% — mental reserves are depleted. Decision quality and code quality both degrade below 25%.")

    # Risk summary
    if risk == "CRITICAL":
        summary = f"CRITICAL: Employee in {dept} department requires immediate intervention. Burnout at {burnout:.0f}/100 with {efficiency:.0f}% efficiency — high flight risk."
    elif risk == "HIGH":
        summary = f"HIGH RISK: Burnout trajectory is concerning at {burnout:.0f}/100. Proactive measures recommended within this sprint to prevent escalation."
    elif risk == "MEDIUM":
        summary = f"MODERATE: Employee shows some stress indicators (burnout {burnout:.0f}/100) but efficiency ({efficiency:.0f}%) remains solid. Continue monitoring."
    else:
        summary = f"STABLE: Employee is performing well with healthy burnout levels ({burnout:.0f}/100) and strong efficiency ({efficiency:.0f}%). No intervention needed."

    return {
        "observations": observations[:3],
        "recommendations": recommendations[:2] if recommendations else ["Continue current work patterns — data shows sustainable productivity."],
        "risk_summary": summary,
    }


def _generate_local_dept_insight(dept: str, stats: dict) -> dict:
    """Generate department-level insights locally."""
    avg_eff = stats.get("avg_efficiency", 0)
    avg_burn = stats.get("avg_burnout", 0)
    at_risk = stats.get("at_risk_count", 0)
    critical = stats.get("critical_count", 0)
    team_size = stats.get("team_size", 0)

    observations = []
    recommendations = []

    if critical > 0:
        observations.append(f"{critical} team member{'s' if critical != 1 else ''} at CRITICAL burnout level requiring immediate attention. This represents {(critical/max(team_size,1)*100):.0f}% of the {dept} team.")
        recommendations.append(f"Conduct emergency 1:1s with critical-risk employees. Review sprint commitments — the team may be over-capacity.")

    if avg_burn > 50:
        observations.append(f"Team average burnout of {avg_burn:.0f}/100 exceeds the healthy threshold. This is a systemic issue — individual interventions alone won't solve it.")
        recommendations.append("Review team capacity vs sprint velocity. Consider reducing WIP limits and increasing recovery time.")
    elif avg_burn < 25:
        observations.append(f"Team burnout average of {avg_burn:.0f}/100 is excellent. The {dept} team has healthy, sustainable work patterns.")

    if avg_eff >= 65:
        observations.append(f"Team efficiency at {avg_eff:.0f}% is above the organisational benchmark. Strong indicators of good tooling and clear priorities.")
    elif avg_eff < 50:
        observations.append(f"Below-benchmark efficiency ({avg_eff:.0f}%) across the team suggests tooling friction or priority misalignment at the team level.")

    risk_pct = (at_risk / max(team_size, 1)) * 100
    if risk_pct > 30:
        summary = f"WARNING: {at_risk} of {team_size} employees ({risk_pct:.0f}%) are at risk in {dept}. Team-level intervention required."
    elif risk_pct > 10:
        summary = f"CAUTION: {dept} has {at_risk} at-risk employees. Burnout avg {avg_burn:.0f}/100. Monitor closely."
    else:
        summary = f"HEALTHY: {dept} team is performing well — {avg_eff:.0f}% efficiency, {avg_burn:.0f}/100 burnout. {at_risk} at-risk."

    return {
        "observations": observations[:3],
        "recommendations": recommendations[:2] if recommendations else ["Maintain current team practices. Consider documenting workflows as a model for other departments."],
        "risk_summary": summary,
    }


# ── Main API functions ───────────────────────────────────────────────────────

def _build_employee_prompt(sanitised: dict, rlhf_prefix: str) -> str:
    return f"""{rlhf_prefix}You are an expert workforce analytics AI analyzing anonymised employee data.

Anonymous ID: {sanitised['anon_id']}
Department: {sanitised.get('department', 'Unknown')}

Privacy-sanitised metrics (differential privacy noise applied):
- Efficiency Score: {sanitised.get('efficiency', 0):.1f}%
- Burnout Risk Score: {sanitised.get('burnout_score', 0):.1f}/100 (higher = worse)
- Cognitive Battery: {sanitised.get('cognitive_battery', 100):.1f}%
- Risk Level: {sanitised.get('risk_level', 'LOW')}
- Distraction Rate: {sanitised.get('distraction_pct', 0):.1f}%
- After-Hours Rate: {sanitised.get('after_hours_pct', 0):.1f}%
- Context Switch Rate: {sanitised.get('switch_rate_pct', 0):.1f}%
- Focus Flow Active: {sanitised.get('focus_flow_state', False)}
- Total Activity Events: {sanitised.get('total_events', 0)}

NOTE: No personally identifiable information has been included.

Respond ONLY with valid JSON (no markdown, no backticks):
{{
  "observations": ["observation 1", "observation 2", "observation 3"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "risk_summary": "one sentence overall assessment"
}}"""


def _build_dept_prompt(sanitised: dict, dept: str, rlhf_prefix: str) -> str:
    return f"""{rlhf_prefix}You are an expert workforce analytics AI analyzing team health data.

Department: {sanitised.get('department', dept)}
Team Size: {sanitised.get('team_size', 0)} employees

Privacy-sanitised aggregate metrics:
- Average Efficiency: {sanitised.get('avg_efficiency', 0):.1f}%
- Average Burnout Score: {sanitised.get('avg_burnout', 0):.1f}/100
- Employees At Risk (HIGH/CRITICAL): {sanitised.get('at_risk_count', 0)}/{sanitised.get('team_size', 0)}
- Critical Risk Count: {sanitised.get('critical_count', 0)}
- Employees in Focus Flow: {sanitised.get('in_flow_count', 0)}

Respond ONLY with valid JSON (no markdown, no backticks):
{{
  "observations": ["observation 1", "observation 2", "observation 3"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "risk_summary": "one sentence team health summary"
}}"""


async def generate_employee_insight(emp_id: str, stats: dict, recent_apps: list[str]) -> dict:
    """Generate AI insights with 3-tier fallback: Gemini → Groq → Local Rules."""
    from services.privacy import sanitise_employee_stats
    sanitised, audit = sanitise_employee_stats(emp_id, stats, epsilon=1.0)

    print(f"  🔒 Privacy audit [{emp_id}]: DP noise applied ε={audit['epsilon']}, "
          f"anon_id={audit['anon_id']}, raw_apps_sent={audit['raw_apps_sent']}")

    rlhf_prefix = ""
    try:
        from database import get_db
        from services.prompt_calibration import build_calibrated_prompt_prefix
        rlhf_prefix = await build_calibrated_prompt_prefix(get_db())
    except Exception:
        pass

    prompt = _build_employee_prompt(sanitised, rlhf_prefix)

    # ── Tier 1: Gemini ────────────────────────────────────────────────────────
    try:
        model = _get_model()
        response = await _call_with_retry(model, prompt)
        raw = response.text.strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        print("  [OK] AI insight generated via Gemini")
        return {
            "observations":    parsed.get("observations", [])[:3],
            "recommendations": parsed.get("recommendations", [])[:2],
            "risk_summary":    parsed.get("risk_summary", ""),
            "raw_response":    raw,
            "privacy_audit":   audit,
            "ai_provider":     "Gemini 2.0 Flash",
        }
    except Exception as e1:
        print(f"  ⚠ Gemini failed: {e1}")

    # ── Tier 2: Groq (free Llama3) ────────────────────────────────────────────
    try:
        parsed = await _call_groq(prompt)
        print("  [OK] AI insight generated via Groq (Llama3)")
        return {
            "observations":    parsed.get("observations", [])[:3],
            "recommendations": parsed.get("recommendations", [])[:2],
            "risk_summary":    parsed.get("risk_summary", ""),
            "raw_response":    json.dumps(parsed),
            "privacy_audit":   audit,
            "ai_provider":     "Groq Llama 3.3 70B",
        }
    except Exception as e2:
        print(f"  ⚠ Groq failed: {e2}")

    # ── Tier 3: Local rule-based engine (zero API) ────────────────────────────
    print("  [INFO] Using local rule-based analysis (no API needed)")
    result = _generate_local_insight(stats)
    result["privacy_audit"] = audit
    result["ai_provider"] = "Local Rule Engine"
    return result


async def generate_department_insight(dept: str, emp_stats: list[dict]) -> dict:
    """Generate department-level insights with 3-tier fallback."""
    if not emp_stats:
        return {"observations": [], "recommendations": [], "risk_summary": "No data"}

    from services.privacy import sanitise_department_stats
    sanitised, audit = sanitise_department_stats(dept, emp_stats, epsilon=1.0)

    rlhf_prefix = ""
    try:
        from database import get_db
        from services.prompt_calibration import build_calibrated_prompt_prefix
        rlhf_prefix = await build_calibrated_prompt_prefix(get_db())
    except Exception:
        pass

    prompt = _build_dept_prompt(sanitised, dept, rlhf_prefix)

    # ── Tier 1: Gemini ────────────────────────────────────────────────────────
    try:
        model = _get_model()
        response = await _call_with_retry(model, prompt)
        raw = response.text.strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        parsed["ai_provider"] = "Gemini 2.0 Flash"
        return parsed
    except Exception as e1:
        print(f"  ⚠ Gemini dept failed: {e1}")

    # ── Tier 2: Groq ─────────────────────────────────────────────────────────
    try:
        parsed = await _call_groq(prompt)
        parsed["ai_provider"] = "Groq Llama 3.3 70B"
        return parsed
    except Exception as e2:
        print(f"  ⚠ Groq dept failed: {e2}")

    # ── Tier 3: Local rules ──────────────────────────────────────────────────
    print("  [INFO] Using local rule-based dept analysis")
    result = _generate_local_dept_insight(dept, sanitised)
    result["ai_provider"] = "Local Rule Engine"
    return result

