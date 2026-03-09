"""routes/auth.py — POST /api/auth/google → verify Firebase token → issue JWT."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from database import users_col
from middleware.auth import verify_firebase_token, create_jwt, get_current_user
from models import GoogleAuthRequest, TokenResponse
from services.audit import log_event_bg, AUTH_LOGIN, AUTH_DEMO_LOGIN

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Employees EMP001-EMP050 get Employee role automatically;
# everyone else gets HR Manager for demo purposes.
# In production, manage roles via MongoDB.


def _infer_role(email: str, google_uid: str) -> str:
    """Default role assignment for new users — override in DB after creation."""
    # Google sign-ins default to HR Manager
    # Employees are created via the seeder with emp_id linked
    return "HR Manager"


@router.post("/google", response_model=TokenResponse)
async def google_signin(req: GoogleAuthRequest, request: Request):
    """
    1. Verify Firebase ID token from frontend
    2. Upsert user in MongoDB
    3. Return app JWT
    """
    idinfo = verify_firebase_token(req.id_token)

    uid     = idinfo["sub"]
    email   = idinfo.get("email", "")
    name    = idinfo.get("name", email.split("@")[0])
    picture = idinfo.get("picture", "")

    col = users_col()
    existing = await col.find_one({"google_uid": uid})

    if existing:
        # Update last-seen info
        await col.update_one(
            {"google_uid": uid},
            {"$set": {"name": name, "picture": picture, "last_login": datetime.utcnow()}},
        )
        role   = existing.get("role", "HR Manager")
        emp_id = existing.get("emp_id")
    else:
        # New user
        role   = _infer_role(email, uid)
        emp_id = None
        await col.insert_one({
            "google_uid": uid,
            "email":      email,
            "name":       name,
            "picture":    picture,
            "role":       role,
            "emp_id":     emp_id,
            "created_at": datetime.utcnow(),
            "last_login": datetime.utcnow(),
        })

    token = create_jwt({"sub": uid, "email": email, "role": role, "emp_id": emp_id, "name": name})

    # Audit: log Google login
    log_event_bg(
        AUTH_LOGIN, actor=uid, actor_role=role, target=email,
        details={"name": name, "method": "google", "emp_id": emp_id},
        ip=request.client.host if request.client else "",
    )

    return TokenResponse(
        access_token=token,
        user={"uid": uid, "email": email, "name": name, "picture": picture, "role": role, "emp_id": emp_id},
    )


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return currently authenticated user from JWT."""
    col = users_col()
    doc = await col.find_one({"google_uid": user["sub"]}, {"_id": 0})
    return doc or user


@router.post("/demo-login")
async def demo_login(body: dict):
    """
    Demo login for employees — authenticate by emp_id.
    Finds the demo user seeded with that emp_id and returns a JWT.
    For presentation/demo use only.
    """
    emp_id = (body.get("emp_id") or "").upper()
    if not emp_id:
        from fastapi import HTTPException
        raise HTTPException(400, "emp_id is required")

    col = users_col()
    user_doc = await col.find_one({"emp_id": emp_id})

    if not user_doc:
        # Auto-create employee account for any valid twin
        from database import twins_col
        twin = await twins_col().find_one({"emp_id": emp_id})
        if not twin:
            from fastapi import HTTPException
            raise HTTPException(404, f"No employee found with ID {emp_id}")

        user_doc = {
            "google_uid": f"demo-{emp_id.lower()}",
            "email":      f"{emp_id.lower()}@flowai.demo",
            "name":       f"Employee {emp_id}",
            "picture":    "",
            "role":       "Employee",
            "emp_id":     emp_id,
            "created_at": datetime.utcnow(),
        }
        await col.insert_one(user_doc)

    uid    = user_doc["google_uid"]
    email  = user_doc.get("email", "")
    name   = user_doc.get("name", emp_id)
    role   = user_doc.get("role", "Employee")
    pic    = user_doc.get("picture", "")

    await col.update_one({"google_uid": uid}, {"$set": {"last_login": datetime.utcnow()}})

    token = create_jwt({"sub": uid, "email": email, "role": role, "emp_id": emp_id, "name": name})

    # Audit: log demo employee login
    log_event_bg(
        AUTH_DEMO_LOGIN, actor=uid, actor_role=role, target=emp_id,
        details={"name": name, "method": "demo_login"},
    )

    return TokenResponse(
        access_token=token,
        user={"uid": uid, "email": email, "name": name, "picture": pic, "role": role, "emp_id": emp_id},
    )
