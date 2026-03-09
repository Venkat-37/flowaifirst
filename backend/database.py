"""database.py — Motor async MongoDB client with collection accessors."""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import get_settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db() -> None:
    global _client, _db
    settings = get_settings()
    
    # Import certifi for Windows SSL Handshake with MongoDB Atlas
    import certifi
    
    _client = AsyncIOMotorClient(settings.mongodb_uri, tlsCAFile=certifi.where())
    _db = _client[settings.mongodb_db]
    # Verify connection
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


# ── Collection accessors ──────────────────────────────────────────────────────

def users_col():
    return get_db()["users"]

def employees_col():
    return get_db()["employees"]

def activity_col():
    return get_db()["activity_events"]

def twins_col():
    return get_db()["digital_twins"]

def insights_col():
    return get_db()["ai_insights"]

def notifications_col():
    return get_db()["notifications"]
