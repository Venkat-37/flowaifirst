import asyncio
import httpx

async def test_telemetry_history():
    emp_id = 'EMP001'
    
    # We will simulate 12 quick events, logging them as tracking_agent unauthenticated events.
    # The first 9 will not write a history snapshot. The 10th one will. The 11th and 12th won't.
    print(f"Sending 12 active tracking events for {emp_id}...")
    
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        for i in range(12):
            resp = await client.post("/api/telemetry/track-activity", json={
                "emp_id": emp_id,
                "app_name": "Antigravity",
                "window_title": f"FlowAI Editing {i}",
            })
            resp.raise_for_status()
            print(f"Event {i+1} recorded.")
    print("Done generating telemetry.")
    

if __name__ == "__main__":
    asyncio.run(test_telemetry_history())
