"""services/seeder.py — Idempotent CSV → MongoDB seeder. Runs on startup."""
from __future__ import annotations
import csv
import os
from datetime import datetime
from database import activity_col, employees_col, twins_col, users_col, insights_col
from services.scoring import compute_stats
from config import get_settings


async def seed_all() -> None:
    """
    Seed MongoDB from CSV if collections are empty.
    Safe to call on every startup — checks before inserting.
    """
    settings = get_settings()
    await _seed_activity(settings.csv_path)
    await _seed_twins()
    await _ensure_demo_users()
    await _run_migrations()
    print("✓ Seed complete")


async def _seed_activity(csv_path: str) -> None:
    col = activity_col()
    count = await col.count_documents({})
    if count > 0:
        print(f"  activity_events: {count} docs already present — skip seed")
        return

    if not os.path.exists(csv_path):
        print(f"  ⚠ CSV not found at {csv_path} — skipping activity seed")
        return

    print(f"  Seeding activity_events from {csv_path}…")
    rows = []
    departments: dict[str, str] = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            emp_id = row["Employee_ID"].strip().upper()
            dept   = row["Department"].strip()
            departments[emp_id] = dept
            try:
                ts = datetime.strptime(row["timestamp"].strip(), "%Y-%m-%d %H:%M:%S")
            except ValueError:
                ts = datetime.utcnow()
            rows.append({
                "emp_id":       emp_id,
                "timestamp":    ts,
                "app_name":     row["app_name"].strip(),
                "window_title": row.get("window_title", "").strip(),
                "category":     row["category"].strip(),
                "department":   dept,
            })

    if rows:
        # Bulk insert in chunks of 1000
        for i in range(0, len(rows), 1000):
            await col.insert_many(rows[i:i + 1000])

        # Create indexes
        await col.create_index("emp_id")
        await col.create_index("department")
        await col.create_index("timestamp")
        print(f"  ✓ Inserted {len(rows)} activity events")

    # Seed employees collection
    emp_col = employees_col()
    emp_count = await emp_col.count_documents({})
    if emp_count == 0 and departments:
        emp_docs = [{"emp_id": eid, "department": dept} for eid, dept in departments.items()]
        await emp_col.insert_many(emp_docs)
        await emp_col.create_index("emp_id", unique=True)
        print(f"  ✓ Inserted {len(emp_docs)} employee records")


async def _seed_twins() -> None:
    """Compute and store digital twin state for every employee."""
    col = twins_col()
    count = await col.count_documents({})
    if count > 0:
        print(f"  digital_twins: {count} docs already present — skip")
        return

    print("  Computing digital twins for all employees…")
    act_col = activity_col()

    # Get all unique emp_ids
    emp_ids = await act_col.distinct("emp_id")

    twin_docs = []
    for emp_id in emp_ids:
        events = await act_col.find({"emp_id": emp_id}, {"_id": 0}).to_list(None)
        if not events:
            continue
        stats = compute_stats(events)
        dept  = events[0].get("department", "") if events else ""
        twin_docs.append({
            "emp_id":             emp_id,
            "department":         dept,
            "efficiency":         stats["efficiency"],
            "burnout_score":      stats["burnout_score"],
            "cognitive_battery":  stats["cognitive_battery"],
            "risk_level":         stats["risk_level"],
            "total_events":       stats["total_events"],
            "productive_events":  stats["productive_events"],
            "distraction_events": stats["distraction_events"],
            "neutral_events":     stats["neutral_events"],
            "after_hours_events": stats["after_hours_events"],
            "focus_flow_state":   stats["focus_flow_state"],
            "distraction_pct":    stats["distraction_pct"],
            "after_hours_pct":    stats["after_hours_pct"],
            "switch_rate":        stats["switch_rate"],
            "last_updated":       datetime.utcnow(),
            # Heartbeat fields (gap 3.1)
            "heartbeat_status":     "Unknown",
            "last_telemetry_at":    None,
            "heartbeat_checked_at": None,
        })

    if twin_docs:
        await col.insert_many(twin_docs)
        await col.create_index("emp_id", unique=True)
        await col.create_index("department")
        await col.create_index("risk_level")
        print(f"  ✓ Computed {len(twin_docs)} digital twins")


async def _ensure_demo_users() -> None:
    """Create demo users if no users exist."""
    col = users_col()
    count = await col.count_documents({})
    if count > 0:
        return

    demo_users = [
        # HR Manager (existing)
        {
            "google_uid": "demo-admin",
            "email":      "admin@flowai.demo",
            "name":       "FlowAI Admin",
            "picture":    "",
            "role":       "HR Manager",
            "emp_id":     None,
            "created_at": datetime.utcnow(),
        },
        # Demo employees linked to actual twin EMP IDs
        {
            "google_uid": "demo-emp001",
            "email":      "emp001@flowai.demo",
            "name":       "Alex Chen",
            "picture":    "",
            "role":       "Employee",
            "emp_id":     "EMP001",
            "created_at": datetime.utcnow(),
        },
        {
            "google_uid": "demo-emp101",
            "email":      "emp101@flowai.demo",
            "name":       "Sarah Kim",
            "picture":    "",
            "role":       "Employee",
            "emp_id":     "EMP101",
            "created_at": datetime.utcnow(),
        },
        {
            "google_uid": "demo-emp203",
            "email":      "emp203@flowai.demo",
            "name":       "Raj Patel",
            "picture":    "",
            "role":       "Employee",
            "emp_id":     "EMP203",
            "created_at": datetime.utcnow(),
        },
    ]
    await col.insert_many(demo_users)
    await col.create_index("google_uid", unique=True)
    await col.create_index("email")
    print(f"  ✓ Seeded {len(demo_users)} demo users (1 HR + 3 employees)")


async def _run_migrations() -> None:
    """Idempotent migrations — safe to run on every startup."""

    # Gap 3.1: Backfill heartbeat fields on existing twins
    result = await twins_col().update_many(
        {"heartbeat_status": {"$exists": False}},
        {"$set": {"heartbeat_status": "Unknown", "last_telemetry_at": None, "heartbeat_checked_at": None}},
    )
    if result.modified_count:
        print(f"  ✓ Backfilled heartbeat fields on {result.modified_count} twins")

    # Gap 3.3: Compound index on ai_insights for cache lookups
    await insights_col().create_index(
        [("target_id", 1), ("target_type", 1), ("generated_at", -1)]
    )

    # Gap 3.4: TTL on activity_events — 90-day retention
    try:
        await activity_col().create_index("timestamp", expireAfterSeconds=90 * 24 * 3600)
    except Exception:
        pass  # Index may already exist with different options

    print("  ✓ Migrations complete")
