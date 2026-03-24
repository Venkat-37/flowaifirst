"""main.py — FlowAI v3.2 FastAPI Backend.

v3.2 changes over v3.1
-----------------------
- PyJWT replaces python-jose (Python 3.13 compatible).
- Admin router registered at /api/admin.
- Capacity router registered for ODE engine endpoints.
- Hourly heartbeat background task marks stale twins as Offline.
- Version string bumped to 3.2.0.

Preserved from v3.1
--------------------
- SlowAPI rate limiter (300/minute default).
- Audit index creation and startup event logging.
- Telemetry index creation.
- All existing routers: notifications, audit, analytics, ml.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import get_settings
from database import connect_db, close_db
from services.seeder import seed_all
from services.audit import ensure_audit_indexes, log_event, SYSTEM_STARTUP
from routes.telemetry import ensure_telemetry_indexes
from routes import (
    auth, admin, employees, twins, telemetry, insights,
    wellness, forecast, actuation, feedback,
    notifications, audit, analytics, ml, capacity,
    consent, pto, reports, benchmarks, mbi_survey,
)
# Global rate limiter — 300/minute default
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])


# ── Background heartbeat worker ───────────────────────────────────────────────

async def _heartbeat_worker() -> None:
    """Run the twin heartbeat sweep every hour.

    Uses routes.twins._run_heartbeat_check() directly so the same logic
    path is exercised whether triggered by this task or the manual endpoint.
    Errors are caught and logged — a failing sweep must never crash the server.
    """
    from routes.twins import _run_heartbeat_check
    while True:
        try:
            await asyncio.sleep(3600)       # wait 1 hour between sweeps
            result = await _run_heartbeat_check()
            print(
                f"  [HB] Heartbeat sweep: "
                f"{result['summary']['online']} online, "
                f"{result['summary']['offline']} offline, "
                f"{result['summary']['unknown']} unknown"
            )
        except asyncio.CancelledError:
            break                           # clean shutdown
        except Exception as exc:            # never let a sweep crash the worker
            print(f"  [!] Heartbeat sweep error: {exc}")


async def _auto_refresh_worker() -> None:
    """Run a continuous twin refresh sweep every 30 minutes.

    Design decisions:
    - Random startup offset (0-5 min) prevents thundering herd on redeploy.
    - Only refreshes twins marked 'Online' via heartbeat_status (correct
      field — old code queried 'status' which does not exist in the schema).
    - Skips twins updated in the last 25 min (already fresh from live ingest).
    - Hard batch cap of 50 per cycle guards against sudden online-twin spikes.
    - asyncio.sleep(0.1) between employees spreads 50 queries over ~5 s
      instead of firing simultaneously — prevents MongoDB CPU spike.
    - Events capped at last 500 per employee — prevents loading unbounded
      history into memory (.to_list(None) on a busy employee would pull
      tens of thousands of rows on every cycle).
    """
    import random
    import traceback
    from datetime import timedelta
    from database import twins_col, activity_col, twin_history_col
    from services.scoring import compute_stats

    # Random startup jitter: 0–5 minutes so multiple instances
    # after a rolling deploy don't fire at the same instant.
    await asyncio.sleep(random.uniform(0, 300))

    while True:
        try:
            await asyncio.sleep(1800)           # 30-minute cycle

            # Only refresh twins that are online AND stale (>25 min old).
            # Twins already refreshed by live telemetry ingest are skipped.
            stale_cutoff = datetime.utcnow() - timedelta(minutes=25)
            online_twins = await twins_col().find(
                {
                    "heartbeat_status": "Online",   # correct field
                    "$or": [
                        {"last_updated": {"$lt": stale_cutoff}},
                        {"last_updated": {"$exists": False}},
                    ],
                },
                {"emp_id": 1, "_id": 0},
            ).to_list(None)

            # Hard cap: never process more than 50 per cycle.
            batch = online_twins[:50]
            updates_count = 0

            for twin in batch:
                emp_id = twin["emp_id"]
                try:
                    events = await activity_col().find(
                        {"emp_id": emp_id}, {"_id": 0}
                    ).sort("timestamp", -1).limit(500).to_list(500)

                    if not events:
                        continue

                    stats  = compute_stats(events)
                    dept   = events[0].get("department", "")
                    update = {**stats, "department": dept, "last_updated": datetime.utcnow()}

                    await twins_col().update_one(
                        {"emp_id": emp_id}, {"$set": update}, upsert=True
                    )

                    # Write twin_history snapshot for ODE fitting
                    snapshot = {
                        "emp_id":     emp_id,
                        "snapped_at": datetime.utcnow(),
                        **stats,
                    }
                    snapshot.pop("_id", None)
                    await twin_history_col().insert_one(snapshot)

                    updates_count += 1

                except Exception as emp_exc:
                    # One employee failing must not abort the whole batch
                    print(f"  [!] Auto-refresh failed for {emp_id}: {emp_exc}")

                # Jitter — spread DB load across ~5 s
                await asyncio.sleep(0.1)

            print(
                f"  [Auto-Refresh] {updates_count}/{len(batch)} refreshed "
                f"({len(online_twins) - len(batch)} skipped by batch cap, "
                f"{len(online_twins)} total stale online twins found)"
            )

        except asyncio.CancelledError:
            break
        except Exception as exc:
            print(f"  [!] Auto-Refresh sweep error: {exc}")
            traceback.print_exc()

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await seed_all()
    await ensure_audit_indexes()
    await ensure_telemetry_indexes()
    await log_event(SYSTEM_STARTUP, details={"version": "3.2.0"})

    # Start background heartbeat task
    hb_task = asyncio.create_task(_heartbeat_worker(), name="heartbeat-worker")
    # Start auto refresh task
    refresh_task = asyncio.create_task(_auto_refresh_worker(), name="auto-refresh-worker")

    yield   # server is live

    hb_task.cancel()
    refresh_task.cancel()
    try:
        await asyncio.gather(hb_task, refresh_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass
    await close_db()


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="FlowAI v3.2 API",
        version="3.2.0",
        description=(
            "Enterprise AI Workforce Digital Twin Platform — "
            "privacy-first, PyJWT, RLHF, role management, heartbeat monitoring, "
            "ODE capacity engine, forecasting & actuation"
        ),
        lifespan=lifespan,
    )

    # ── Rate limiter ──────────────────────────────────────────────────────────
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── CORS ──────────────────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    application.include_router(auth.router)
    application.include_router(admin.router)
    application.include_router(employees.router)
    application.include_router(twins.router)
    application.include_router(telemetry.router)
    application.include_router(insights.router)
    application.include_router(wellness.router)
    application.include_router(forecast.router)
    application.include_router(actuation.router)
    application.include_router(feedback.router)
    application.include_router(notifications.router)
    application.include_router(audit.router)
    application.include_router(analytics.router)
    application.include_router(ml.router)
    application.include_router(capacity.router)
    application.include_router(consent.router)    # GAP 3
    application.include_router(pto.router)        # GAP 1
    application.include_router(reports.router)    # GAP 2
    application.include_router(benchmarks.router) # GAP 4
    application.include_router(mbi_survey.router)  # MBI survey
    # ── Health endpoint ───────────────────────────────────────────────────────
    @application.get("/health")
    async def health():
        return {
            "status":   "ok",
            "version":  "3.2.0",
            "features": [
                "privacy_dp",
                "forecasting",
                "actuation",
                "wellness",
                "slack",
                "notifications",
                "rlhf",
                "role_management",
                "heartbeat_monitoring",
                "pyjwt",
                "ode_capacity_engine",
                "consent_management",
                "pto_tracking",
                "reporting_engine",
                "benchmarking",
            ],
        }

    return application


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=get_settings().port, reload=True)