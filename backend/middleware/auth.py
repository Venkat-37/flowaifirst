"""middleware/auth.py — JWT issuance + Firebase ID token verification."""
from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from google.oauth2 import id_token as google_id_token
from google.auth.transport.requests import Request as GoogleRequest
from config import get_settings

_bearer = HTTPBearer(auto_error=False)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_jwt(payload: dict) -> str:
    settings = get_settings()
    data = payload.copy()
    data["exp"] = datetime.utcnow() + timedelta(days=settings.jwt_expire_days)
    data["iat"] = datetime.utcnow()
    return jwt.encode(data, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
        )


# ── Google / Firebase token verification ──────────────────────────────────────

def verify_firebase_token(raw_token: str) -> dict:
    """
    Verify a Firebase ID token issued by the frontend.
    Returns the decoded idinfo dict with: sub (uid), email, name, picture.
    Requires FIREBASE_PROJECT_ID in .env.
    """
    settings = get_settings()
    if not settings.firebase_project_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="FIREBASE_PROJECT_ID not configured on server",
        )
    try:
        request = GoogleRequest()
        idinfo  = google_id_token.verify_firebase_token(
            raw_token,
            request,
            audience=settings.firebase_project_id,
        )
        return idinfo
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Firebase token verification failed: {e}",
        )


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """FastAPI dependency — validates Bearer JWT and returns payload."""
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )
    return decode_jwt(creds.credentials)


async def require_hr_manager(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "HR Manager":
        raise HTTPException(status_code=403, detail="HR Manager access required")
    return user
