"""config.py — All environment variable loading via pydantic-settings."""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "flowai"

    # JWT
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # Firebase / Google Auth
    firebase_project_id: str = ""

    # Gemini
    gemini_api_key: str = ""

    # Groq (free fallback for AI insights)
    groq_api_key: str = ""

    # Actuation webhook (optional — leave empty for console-only logging)
    actuation_webhook_url: str = ""

    # Anonymisation secret (HMAC key for emp_id anonymisation in webhooks/LLM)
    anon_hmac_key: str = ""

    # App
    environment: str = "development"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Data
    csv_path: str = "data/employee_app_activity_v2.csv"

    # Privacy
    dp_epsilon: float = 1.0   # differential privacy budget (lower = stronger privacy)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
