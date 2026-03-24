import asyncio
from database import connect_db, get_db
from services.bandit_service import bandit_service

async def run():
    await connect_db()
    
    print("Testing update_reward for EMP001, observation, reward=1.0")
    await bandit_service.update_reward("EMP001", "observation", 1.0)
    
    db = get_db()
    res = await db["bandit_stats"].find_one({"emp_id": "EMP001"})
    print("Bandit Stats for EMP001:", res)
    
    from database import close_db
    await close_db()

asyncio.run(run())
