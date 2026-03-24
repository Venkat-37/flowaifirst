import asyncio
from database import connect_db, twin_history_col, close_db

async def count_snapshots():
    await connect_db()
    count = await twin_history_col().count_documents({"emp_id": "EMP001"})
    print(f"Twin History Snapshots for EMP001: {count}")
    await close_db()

if __name__ == "__main__":
    asyncio.run(count_snapshots())
