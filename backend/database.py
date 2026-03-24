# database.py — the single source of truth for every collection
"""database.py — MongoDB connection pool and collection accessors.

ARCHITECTURE RULE:
  Every collection in the system is accessed ONLY through a named helper
  defined in this file. No route or service may use get_db()["raw_string"].
  If you add a new collection, add a helper here first.

Collections:
  users               — auth accounts and roles
  employees           — employee master records
  activity_events     — raw telemetry from edge agents
  digital_twins       — current twin state per employee
  twin_history        — time-series twin snapshots (for ODE fitting)
  ode_params          — per-employee fitted ODE parameters
  ai_insights         — Gemini insight cache (1-hour TTL)
  mood_logs           — employee mood diary entries
  wellness_goals      — employee wellness goal tracking
  pomodoro_sessions   — Pomodoro timer session log
  actuations          — actuation webhook log (append-only)
  audit_log           — system event audit trail (append-only)
  notifications       — employee notification inbox
  bandit_stats        — CMAB per-employee Beta posteriors
  mbi_survey_responses — MBI-GS questionnaire submissions
  ode_params          — per-employee ODE alpha/beta/gamma/delta
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import get_settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


# ── Collection accessors ──────────────────────────────────────────────────────
# One function per collection. Defined before initialization logic to resolve imports.

def users_col():              return get_db()["users"]
def employees_col():          return get_db()["employees"]
def activity_col():           return get_db()["activity_events"]
def twins_col():              return get_db()["digital_twins"]
def twin_history_col():       return get_db()["twin_history"]
def ode_params_col():         return get_db()["ode_params"]
def insights_col():           return get_db()["ai_insights"]
def mood_col():               return get_db()["mood_logs"]
def goals_col():              return get_db()["wellness_goals"]
def pomodoro_col():           return get_db()["pomodoro_sessions"]
def actuations_col():         return get_db()["actuations"]
def audit_col():              return get_db()["audit_log"]
def notifications_col():      return get_db()["notifications"]
def bandit_stats_col():       return get_db()["bandit_stats"]
def mbi_responses_col():      return get_db()["mbi_survey_responses"]
def consent_col():            return get_db()["consent_records"]
def pto_logs_col():           return get_db()["pto_logs"]
def behavior_col():           return get_db()["behavior_profiles"]
def consent_records_col():    return get_db()["consent_records"]
def tracking_col():           return get_db()["tracking_events"]


async def connect_db() -> None:
    global _client, _db
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongodb_uri)
    _db = _client[settings.mongodb_db]
    await _client.admin.command("ping")
    print(f"✓ MongoDB connected → {settings.mongodb_db}")


async def close_db() -> None:
    global _client
    if _client:
        _client.close()
        print("MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised — call connect_db() first")
    return _db