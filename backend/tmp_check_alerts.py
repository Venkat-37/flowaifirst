import asyncio
from database import connect_db, close_db, get_db
from services.actuation import fire_actuation, TRIGGER_DO_NOT_DISTURB

async def main():
    await connect_db()
    db = get_db()
    
    emp_id = "EMP001"
    trigger = TRIGGER_DO_NOT_DISTURB
    context = {"burnout_score": 90, "risk_level": "HIGH", "efficiency": 50}
    
    print("\nExecuting FIRST actuation (should SUCCEED)...")
    res1 = await fire_actuation(emp_id, trigger, context)
    print("Result 1:", "FIRED" if res1 else "SUPPRESSED")
    
    print("\nExecuting SECOND actuation immediately (should be SUPPRESSED)...")
    res2 = await fire_actuation(emp_id, trigger, context)
    print("Result 2:", "FIRED" if res2 else "SUPPRESSED")
    
    print("\nExecuting THIRD actuation with MANUAL_OVERRIDE (should SUCCEED)...")
    context_manual = context.copy()
    context_manual["manual_override"] = True
    res3 = await fire_actuation(emp_id, trigger, context_manual)
    print("Result 3:", "FIRED" if res3 else "SUPPRESSED")
    
    await close_db()

if __name__ == "__main__":
    asyncio.run(main())
