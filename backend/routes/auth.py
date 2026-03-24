"""routes/auth.py — POST /api/auth/google → verify Firebase token → issue JWT."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from database import users_col
from middleware.auth import verify_firebase_token, create_jwt, get_current_user
from models import GoogleAuthRequest, TokenResponse, PasswordLoginRequest
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


@router.post("/login", response_model=TokenResponse)
async def password_login(req: PasswordLoginRequest, request: Request):
    """
    Unified login for Admin, HR, and Employees via password.

    HARDCODED FALLBACK: Demo accounts are checked FIRST so login
    works even if MongoDB is down, the seeder failed, or data was wiped.
    """
    username = req.username.strip()
    password = req.password

    # Normalize username: if user types "1" or "001", transform to "EMP001"
    if username.isdigit():
        username = f"EMP{int(username):03d}"

    # ── 1. Hardcoded demo accounts — NEVER depend on DB ─────────────────────
    _DEMO_ACCOUNTS = {
        # username → (password, uid, email, name, role, emp_id)
        "admin":  ("admin123", "sys-admin",   "admin",               "System Admin",    "admin",      None),
        "hr":     ("hr123",    "demo-hr",     "hr",                  "HR Manager",      "HR Manager", None),
        "EMP001": ("emp123",   "demo-emp001", "emp001@flowai.demo",  "Alex Chen",       "Employee",   "EMP001"),
        "EMP101": ("emp123",   "demo-emp101", "emp101@flowai.demo",  "Sarah Kim",       "Employee",   "EMP101"),
        "EMP203": ("emp123",   "demo-emp203", "emp203@flowai.demo",  "Raj Patel",       "Employee",   "EMP203"),
    }

    # Check demo accounts (case-insensitive for username, exact for password)
    demo = _DEMO_ACCOUNTS.get(username) or _DEMO_ACCOUNTS.get(username.upper())
    if demo and password == demo[0]:
        pwd, uid, email, name, role, emp_id = demo
        token = create_jwt({"sub": uid, "email": email, "role": role, "emp_id": emp_id, "name": name})
        log_event_bg(
            AUTH_LOGIN, actor=uid, actor_role=role, target=username,
            details={"name": name, "method": "demo_hardcoded"},
            ip=request.client.host if request.client else "",
        )
        return TokenResponse(
            access_token=token,
            user={"uid": uid, "email": email, "name": name, "picture": "", "role": role, "emp_id": emp_id},
        )

    # ── 2. MongoDB lookup (for real / non-demo accounts) ────────────────────
    col = users_col()
    user_doc = await col.find_one({
        "$or": [
            {"email": username},
            {"emp_id": username.upper()},
            {"google_uid": username}
        ]
    })

    if not user_doc:
        emp_id_str = username.upper()
        if emp_id_str.startswith("EMP"):
            from database import twins_col
            twin = await twins_col().find_one({"emp_id": emp_id_str})
            if twin:
                user_doc = {
                    "google_uid": f"demo-{emp_id_str.lower()}",
                    "email":      f"{emp_id_str.lower()}@flowai.demo",
                    "name":       f"Employee {emp_id_str}",
                    "password":   "emp123",
                    "picture":    "",
                    "role":       "Employee",
                    "emp_id":     emp_id_str,
                    "created_at": datetime.utcnow(),
                }
                await col.insert_one(user_doc)
            else:
                from fastapi import HTTPException
                raise HTTPException(401, "Invalid credentials or Twin not found")
        else:
            from fastapi import HTTPException
            raise HTTPException(401, "Invalid credentials")

    if user_doc.get("password") != password:
        from fastapi import HTTPException
        raise HTTPException(401, "Invalid credentials")

    uid    = user_doc["google_uid"]
    email  = user_doc.get("email", "")
    name   = user_doc.get("name", username)
    role   = user_doc.get("role", "Employee")
    emp_id = user_doc.get("emp_id")
    pic    = user_doc.get("picture", "")

    await col.update_one({"google_uid": uid}, {"$set": {"last_login": datetime.utcnow()}})

    token = create_jwt({"sub": uid, "email": email, "role": role, "emp_id": emp_id, "name": name})

    log_event_bg(
        AUTH_LOGIN, actor=uid, actor_role=role, target=username,
        details={"name": name, "method": "password"},
        ip=request.client.host if request.client else "",
    )

    return TokenResponse(
        access_token=token,
        user={"uid": uid, "email": email, "name": name, "picture": pic, "role": role, "emp_id": emp_id},
    )


@router.post("/demo-login")
async def demo_login(body: dict):
    """
    Demo login for employees — authenticate by emp_id.
    Retained for backward compatibility if needed, but redirects to password login style.
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
            "password":   "emp123", # Default password
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
