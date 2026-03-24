import asyncio
import json
from database import connect_db, close_db, get_db

async def main():
    await connect_db()
    db = get_db()
    
    print('--- Recent MBI Responses ---')
    cursor = db['mbi_responses'].find().sort('submitted_at', -1).limit(10)
    docs = await cursor.to_list(10)
    for doc in docs:
        emp = doc.get('employee_id')
        z = doc.get('scores', {}).get('composite_z')
        twin = await db['digital_twins'].find_one({'emp_id': emp})
        has_twin = twin is not None
        print(f"Emp: {emp}, Z: {z}, HasTwin: {has_twin}")

    await close_db()

if __name__ == '__main__':
    asyncio.run(main())
