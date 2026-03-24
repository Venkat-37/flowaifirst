import asyncio
from database import connect_db, close_db, get_db

async def main():
    await connect_db()
    db = get_db()
    
    print('--- MBI Responses ---')
    cursor = db['mbi_responses'].find().sort('submitted_at', -1).limit(5)
    async for doc in cursor:
        print(f"Emp: {doc.get('employee_id')}, composite_z: {doc.get('scores', {}).get('composite_z')}")
        
    print('\n--- Digital Twins ---')
    twin = await db['digital_twins'].find_one()
    if twin:
        print(twin.keys())
        print("emp_id:", twin.get('emp_id'))
        print("burnout_score:", twin.get('burnout_score'))
        
    print('\n--- Pipeline Check ---')
    pipeline = [
        {'$sort': {'submitted_at': -1}},
        {'$group': {
            '_id': '$employee_id',
            'composite_z': {'$first': '$scores.composite_z'}
        }}
    ]
    res = await db['mbi_responses'].aggregate(pipeline).to_list(None)
    print(f'Pipeline grouped count: {len(res)}')
    if len(res) > 0:
        print(f'Sample pipeline output: {res[0]}')

    await close_db()

asyncio.run(main())
