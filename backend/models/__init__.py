"""models/__init__.py — All Pydantic models for request/response validation."""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── User / Auth ───────────────────────────────────────────────────────────────

class UserDoc(BaseModel):
    google_uid: str
    email: str
    name: str
    password: Optional[str] = None  # v3.3: for non-OAuth logic
    picture: str = ""
    role: str = "Employee"       # Employee | HR Manager | Department Head | Admin
    emp_id: Optional[str] = None  # linked employee record
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class GoogleAuthRequest(BaseModel):
    id_token: str


class PasswordLoginRequest(BaseModel):
    username: str  # Can be email or emp_id
    password: str


class EmployeeMappingUpdate(BaseModel):
    department: Optional[str] = None
    job_level: Optional[str] = None
    work_hours_per_week: Optional[float] = None


# ── Employee ──────────────────────────────────────────────────────────────────

class EmployeeDoc(BaseModel):
    emp_id: str
    department: str
    job_level: str = "Mid"
    work_hours_per_week: float = 40.0
    wfh_days: int = 2
    stress_level: int = 5        # 1-10
    work_life_balance: int = 5   # 1-10
    productivity_score: float = 70.0


# ── Activity / Telemetry ──────────────────────────────────────────────────────

class ActivityEventDoc(BaseModel):
    emp_id: str
    timestamp: datetime
    app_name: str
    window_title: str = ""
    category: str                # Productive | Productive (Contextual) | Neutral | Distraction
    department: str = ""


class TelemetryIngest(BaseModel):
    emp_id: str
    app_name: str
    window_title: str = ""
    category: str
    timestamp: Optional[datetime] = None

class MoodIngest(BaseModel):
    emp_id: str
    mood_score: int              # 1-5 scale
    timestamp: Optional[datetime] = None


# ── Digital Twin ──────────────────────────────────────────────────────────────

class TwinDoc(BaseModel):
    emp_id: str
    department: str = ""
    efficiency: float = 0.0          # 0-100
    burnout_score: float = 0.0       # 0-100
    cognitive_battery: float = 100.0  # 0-100
    risk_level: str = "LOW"           # LOW | MEDIUM | HIGH | CRITICAL
    total_events: int = 0
    productive_events: int = 0
    distraction_events: int = 0
    neutral_events: int = 0
    after_hours_events: int = 0
    focus_flow_state: bool = False
    last_updated: datetime = Field(default_factory=datetime.utcnow)


# ── AI Insight ────────────────────────────────────────────────────────────────

class InsightDoc(BaseModel):
    target_id: str           # emp_id or department name
    target_type: str         # employee | department
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    model: str = "gemini-2.0-flash"
    observations: list[str] = []
    recommendations: list[str] = []
    risk_summary: str = ""
    raw_response: str = ""


class InsightRequest(BaseModel):
    target_id: str
    target_type: str = "employee"   # employee | department
    force_refresh: bool = False
