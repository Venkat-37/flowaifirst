import asyncio
import database

async def main():
    await database.connect_db()
    
    print("\n--- CMAB Bandit Action Stats ---")
    async for stat in database.db()["bandit_stats"].find():
        print(f"Action: {stat.get('action_id')} | alpha (wins): {stat.get('alpha')} | beta (losses): {stat.get('beta')}")
    print("--------------------------------\n")
        
    await database.close_db()

if __name__ == "__main__":
    asyncio.run(main())
