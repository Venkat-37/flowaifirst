"""main.py — FlowAI v3 FastAPI Backend (v3.1 — with privacy, forecasting, actuation, wellness)"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from database import connect_db, close_db
from services.seeder import seed_all
from routes import auth, employees, twins, telemetry, insights
from routes import wellness, forecast, actuation, feedback, notifications, audit
from services.audit import ensure_audit_indexes, log_event, SYSTEM_STARTUP
from config import get_settings

# Global rate limiter — 300/minute default
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await seed_all()
    await ensure_audit_indexes()
    await log_event(SYSTEM_STARTUP, details={"version": "3.1.0"})
    yield
    await close_db()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="FlowAI v3 API",
        version="3.1.0",
        description="Enterprise AI Workforce Digital Twin Platform — with privacy, forecasting & actuation",
        lifespan=lifespan,
    )
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(auth.router)
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

    @application.get("/health")
    async def health():
        return {
            "status": "ok",
            "version": "3.1.0",
            "features": ["privacy_dp", "forecasting", "actuation", "wellness", "slack", "notifications"],
        }

    return application


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=get_settings().port, reload=True)

