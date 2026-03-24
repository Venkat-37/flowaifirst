"""services/seeder.py — Idempotent CSV → MongoDB seeder. Runs on startup."""
from __future__ import annotations
import csv
import os
import random
from datetime import datetime, timedelta
from database import activity_col, employees_col, twins_col, users_col, insights_col, behavior_col, twin_history_col
from services.scoring import compute_stats
from config import get_settings


async def seed_all() -> None:
    """
    Seed MongoDB from CSV if collections are empty.
    Safe to call on every startup — checks before inserting.
    """
    settings = get_settings()
    await _seed_activity(settings.csv_path)
    await _seed_behavior()
    await _seed_twins()
    await _ensure_demo_users()
    await _run_migrations()
    await _seed_history()
    print("[OK] Seed complete")


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
        print(f"  [OK] Inserted {len(rows)} activity events")

    # Seed employees collection
    emp_col = employees_col()
    emp_count = await emp_col.count_documents({})
    if emp_count == 0 and departments:
        emp_docs = [{"emp_id": eid, "department": dept} for eid, dept in departments.items()]
        await emp_col.insert_many(emp_docs)
        await emp_col.create_index("emp_id", unique=True)
        print(f"  [OK] Inserted {len(emp_docs)} employee records")



async def _seed_behavior() -> None:
    """Seed behavioral profiles from behavior_dataset.csv."""
    col = behavior_col()
    count = await col.count_documents({})
    if count > 0:
        print(f"  behavior_profiles: {count} docs already present — skip seed")
        return

    csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "behavior_dataset.csv")
    if not os.path.exists(csv_path):
        print(f"  ⚠ behavior_dataset.csv not found — skipping")
        return

    print(f"  Seeding behavior_profiles from {csv_path}…")
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            emp_id = row["Employee_ID"].strip().upper()
            rows.append({
                "emp_id":               emp_id,
                "department":           row.get("Department_x", "").strip(),
                "job_level":            row.get("Job_Level", "").strip(),
                "work_hours_per_week":  float(row.get("Work_Hours_Per_Week", 40)),
                "meetings_per_week":    int(row.get("Meetings_Per_Week", 0)),
                "wfh_days_per_week":    int(row.get("WFH_Days_Per_Week", 0)),
                "productivity_score":   int(row.get("Productivity_Score", 50)),
                "stress_level":         int(row.get("Stress_Level", 5)),
                "work_life_balance":    int(row.get("Work_Life_Balance", 5)),
                "team_department":      row.get("Department_y", "").strip(),
            })

    if rows:
        await col.insert_many(rows)
        await col.create_index("emp_id", unique=True)
        print(f"  [OK] Inserted {len(rows)} behavior profiles")


async def _seed_twins() -> None:
    """Compute and store digital twin state for every employee — merges activity + behavioral data."""
    col = twins_col()
    count = await col.count_documents({})
    if count > 0:
        print(f"  digital_twins: {count} docs already present — skip")
        return

    print("  Computing digital twins for all employees…")
    act_col = activity_col()
    beh_col = behavior_col()

    # Load all behavioral profiles into a lookup dict
    behavior_lookup = {}
    async for bdoc in beh_col.find({}, {"_id": 0}):
        behavior_lookup[bdoc["emp_id"]] = bdoc

    # Get all unique emp_ids from both activity and behavior data
    activity_emp_ids = set(await act_col.distinct("emp_id"))
    behavior_emp_ids = set(behavior_lookup.keys())
    all_emp_ids = activity_emp_ids | behavior_emp_ids

    twin_docs = []
    for emp_id in sorted(all_emp_ids):
        events = await act_col.find({"emp_id": emp_id}, {"_id": 0}).to_list(None)
        stats = compute_stats(events) if events else compute_stats([])
        dept = events[0].get("department", "") if events else ""

        # Get behavioral profile
        beh = behavior_lookup.get(emp_id, {})

        # Enhanced burnout: factor in stress_level and work_hours
        base_burnout = stats["burnout_score"]
        stress = beh.get("stress_level", 5)
        wlb = beh.get("work_life_balance", 5)
        work_hours = beh.get("work_hours_per_week", 40)

        # Behavioral adjustment: high stress (>7) and long hours (>45) push burnout up
        stress_adj = max(stress - 5, 0) * 3        # 0-15 pts from stress (6-10 scale)
        hours_adj = max(work_hours - 40, 0) * 0.5  # 0-10 pts from overwork
        wlb_adj = max(5 - wlb, 0) * 2              # 0-10 pts from poor WLB
        enhanced_burnout = min(base_burnout + stress_adj + hours_adj + wlb_adj, 100)

        enhanced_cog = round(max(100 - enhanced_burnout * 0.75, 0), 1)
        enhanced_risk = (
            "CRITICAL" if enhanced_burnout >= 75 else
            "HIGH" if enhanced_burnout >= 55 else
            "MEDIUM" if enhanced_burnout >= 35 else "LOW"
        )

        twin_docs.append({
            "emp_id":              emp_id,
            "department":          beh.get("department", dept) or dept,
            "job_level":           beh.get("job_level", ""),
            "team_department":     beh.get("team_department", ""),
            # Activity-derived metrics
            "efficiency":          stats["efficiency"],
            "total_events":        stats["total_events"],
            "productive_events":   stats["productive_events"],
            "distraction_events":  stats["distraction_events"],
            "neutral_events":      stats["neutral_events"],
            "after_hours_events":  stats["after_hours_events"],
            "focus_flow_state":    stats["focus_flow_state"],
            "focus_streak":        stats.get("focus_streak", 0),
            "distraction_pct":     stats["distraction_pct"],
            "after_hours_pct":     stats["after_hours_pct"],
            "switch_rate":         stats["switch_rate"],
            # Enhanced burnout (activity + behavioral)
            "burnout_score":       round(enhanced_burnout, 1),
            "cognitive_battery":   enhanced_cog,
            "risk_level":          enhanced_risk,
            # Behavioral metrics from HR data
            "stress_level":        stress,
            "work_life_balance":   wlb,
            "work_hours_per_week": work_hours,
            "meetings_per_week":   beh.get("meetings_per_week", 0),
            "wfh_days_per_week":   beh.get("wfh_days_per_week", 0),
            "productivity_score":  beh.get("productivity_score", 0),
            # Metadata
            "last_updated":        datetime.utcnow(),
            "heartbeat_status":    "Unknown",
            "last_telemetry_at":   None,
            "heartbeat_checked_at": None,
        })

    if twin_docs:
        await col.insert_many(twin_docs)
        await col.create_index("emp_id", unique=True)
        await col.create_index("department")
        await col.create_index("risk_level")
        print(f"  [OK] Computed {len(twin_docs)} digital twins (activity + behavioral)")


async def _ensure_demo_users() -> None:
    """
    Ensure critical demo users exist with intended credentials.
    Uses upsert to guarantee self-substantiation on every startup.
    """
    col = users_col()
    
    demo_users = [
        # Admin Account (System Admin)
        {
            "google_uid": "sys-admin",
            "email":      "admin",
            "name":       "System Admin",
            "password":   "admin123",
            "picture":    "",
            "role":       "admin",
            "emp_id":     None,
            "created_at": datetime.utcnow(),
        },
        # HR Manager
        {
            "google_uid": "demo-hr",
            "email":      "hr",
            "name":       "HR Manager",
            "password":   "hr123",
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
            "password":   "emp123",
            "picture":    "",
            "role":       "Employee",
            "emp_id":     "EMP001",
            "created_at": datetime.utcnow(),
        },
        {
            "google_uid": "demo-emp101",
            "email":      "emp101@flowai.demo",
            "name":       "Sarah Kim",
            "password":   "emp123",
            "picture":    "",
            "role":       "Employee",
            "emp_id":     "EMP101",
            "created_at": datetime.utcnow(),
        },
        {
            "google_uid": "demo-emp203",
            "email":      "emp203@flowai.demo",
            "name":       "Raj Patel",
            "password":   "emp123",
            "picture":    "",
            "role":       "Employee",
            "emp_id":     "EMP203",
            "created_at": datetime.utcnow(),
        },
    ]

    for user in demo_users:
        # Guarantee critical users always have the right role/password/UID
        await col.update_one(
            {"google_uid": user["google_uid"]},
            {"$set": user},
            upsert=True
        )
    
    # Ensure indexes
    await col.create_index("google_uid", unique=True)
    await col.create_index("email")
    print(f"  [OK] Synchronized {len(demo_users)} critical demo accounts")


async def _run_migrations() -> None:
    """Idempotent migrations — safe to run on every startup."""

    # Gap 3.1: Backfill heartbeat fields on existing twins
    result = await twins_col().update_many(
        {"heartbeat_status": {"$exists": False}},
        {"$set": {"heartbeat_status": "Unknown", "last_telemetry_at": None, "heartbeat_checked_at": None}},
    )
    if result.modified_count:
        print(f"  [OK] Backfilled heartbeat fields on {result.modified_count} twins")

    # Gap 3.3: Compound index on ai_insights for cache lookups
    await insights_col().create_index(
        [("target_id", 1), ("target_type", 1), ("generated_at", -1)]
    )

    # Gap 3.4: TTL on activity_events — 90-day retention
    try:
        await activity_col().create_index("timestamp", expireAfterSeconds=90 * 24 * 3600)
    except Exception:
        pass  # Index may already exist with different options

    # Gap 3.5: Recompute focus_flow_state with relaxed thresholds
    # Only runs if twins still lack the focus_streak field
    needs_recompute = await twins_col().count_documents({"focus_streak": {"$exists": False}})
    if needs_recompute > 0:
        print(f"  Recomputing flow state for {needs_recompute} twins…")
        act = activity_col()
        twin_cur = twins_col().find({"focus_streak": {"$exists": False}}, {"emp_id": 1, "_id": 0})
        async for doc in twin_cur:
            eid = doc["emp_id"]
            events = await act.find({"emp_id": eid}, {"_id": 0}).to_list(None)
            if not events:
                continue
            stats = compute_stats(events)
            await twins_col().update_one(
                {"emp_id": eid},
                {"$set": {
                    "focus_flow_state": stats["focus_flow_state"],
                    "focus_streak":     stats["focus_streak"],
                    "switch_rate":      stats["switch_rate"],
                }},
            )
        print(f"  [OK] Recomputed flow state for {needs_recompute} twins")

    # Behavioral data backfill: merge behavioral profiles into existing twins
    needs_behavior = await twins_col().count_documents({"stress_level": {"$exists": False}})
    if needs_behavior > 0:
        print(f"  Backfilling behavioral data for {needs_behavior} twins…")
        beh_col = behavior_col()
        behavior_lookup = {}
        async for bdoc in beh_col.find({}, {"_id": 0}):
            behavior_lookup[bdoc["emp_id"]] = bdoc

        twin_cur = twins_col().find({"stress_level": {"$exists": False}}, {"emp_id": 1, "burnout_score": 1, "_id": 0})
        updated = 0
        async for doc in twin_cur:
            eid = doc["emp_id"]
            beh = behavior_lookup.get(eid, {})
            stress = beh.get("stress_level", 5)
            wlb = beh.get("work_life_balance", 5)
            work_hours = beh.get("work_hours_per_week", 40)

            base_burnout = doc.get("burnout_score", 0)
            stress_adj = max(stress - 5, 0) * 3
            hours_adj = max(work_hours - 40, 0) * 0.5
            wlb_adj = max(5 - wlb, 0) * 2
            enhanced_burnout = min(base_burnout + stress_adj + hours_adj + wlb_adj, 100)
            enhanced_cog = round(max(100 - enhanced_burnout * 0.75, 0), 1)
            enhanced_risk = (
                "CRITICAL" if enhanced_burnout >= 75 else
                "HIGH" if enhanced_burnout >= 55 else
                "MEDIUM" if enhanced_burnout >= 35 else "LOW"
            )

            await twins_col().update_one(
                {"emp_id": eid},
                {"$set": {
                    "stress_level": stress,
                    "work_life_balance": wlb,
                    "work_hours_per_week": work_hours,
                    "meetings_per_week": beh.get("meetings_per_week", 0),
                    "wfh_days_per_week": beh.get("wfh_days_per_week", 0),
                    "productivity_score": beh.get("productivity_score", 0),
                    "job_level": beh.get("job_level", ""),
                    "team_department": beh.get("team_department", ""),
                    "burnout_score": round(enhanced_burnout, 1),
                    "cognitive_battery": enhanced_cog,
                    "risk_level": enhanced_risk,
                }},
            )
            updated += 1
        print(f"  [OK] Backfilled behavioral data on {updated} twins")

    # v3.3: Backfill password fields for existing users
    await users_col().update_many(
        {"password": {"$exists": False}},
        {"$set": {"password": "emp123"}}
    )
    # Specialized passwords for HR and Admin roles if they already exist
    await users_col().update_many(
        {"role": "HR Manager", "password": "emp123"},
        {"$set": {"password": "hr123"}}
    )
    await users_col().update_many(
        {"role": "admin", "password": "emp123"},
        {"$set": {"password": "admin123"}}
    )

    print("  [OK] Migrations complete")


async def _seed_history() -> None:
    """Generate 30 days of historical twin snapshots for Org Analytics charting."""
    col = twin_history_col()
    count = await col.count_documents({})
    if count > 0:
        print(f"  twin_history: {count} snapshots already present — skip")
        return

    print("  Generating 30 days of historical data for all twins…")
    twins = await twins_col().find({}, {"_id": 0}).to_list(None)
    if not twins:
        return

    history_docs = []
    base_date = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=0)

    for i in range(30):
        # Go backwards in time, starting from 30 days ago to yesterday
        days_ago = 30 - i
        target_date = base_date - timedelta(days=days_ago)
        
        for twin in twins:
            # Add some random walk noise to metrics to make charts look realistic
            eff_noise = random.uniform(-5.0, 5.0)
            burn_noise = random.uniform(-3.0, 4.0)
            stress_noise = random.randint(-1, 1)
            
            # Ensure boundaries
            hist_eff = max(0.0, min(100.0, twin.get("efficiency", 0) + eff_noise))
            hist_burn = max(0.0, min(100.0, twin.get("burnout_score", 0) + burn_noise))
            hist_stress = max(1, min(10, twin.get("stress_level", 5) + stress_noise))
            
            hist_cog = round(max(100 - hist_burn * 0.75, 0), 1)
            
            # Recalculate risk level based on historical burnout
            hist_risk = (
                "CRITICAL" if hist_burn >= 75 else
                "HIGH" if hist_burn >= 55 else
                "MEDIUM" if hist_burn >= 35 else "LOW"
            )

            history_docs.append({
                "emp_id": twin["emp_id"],
                "department": twin.get("department", ""),
                "team_department": twin.get("team_department", ""),
                "timestamp": target_date,
                "efficiency": round(hist_eff, 1),
                "burnout_score": round(hist_burn, 1),
                "cognitive_battery": hist_cog,
                "risk_level": hist_risk,
                "stress_level": hist_stress,
                "work_life_balance": twin.get("work_life_balance", 5),
                "meetings_per_week": twin.get("meetings_per_week", 0),
            })

    if history_docs:
        # Bulk insert
        for i in range(0, len(history_docs), 5000):
            await col.insert_many(history_docs[i:i + 5000])
            
        await col.create_index("emp_id")
        await col.create_index("timestamp")
        await col.create_index("department")
        print(f"  [OK] Seeded {len(history_docs)} historical snapshots")
