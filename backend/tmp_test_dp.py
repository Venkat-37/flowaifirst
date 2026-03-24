import requests
from middleware.auth import create_jwt

token = create_jwt({"role": "hr_manager", "uid": "test_hr"})
headers = {"Authorization": f"Bearer {token}"}

print("\n--- Testing /api/analytics/organization/health ---")
r1 = requests.get("http://localhost:8000/api/analytics/organization/health", headers=headers)
if r1.status_code == 200:
    m1 = r1.json().get("metrics", {})
    print("Call 1: Burnout =", m1.get("avg_burnout"), "Efficiency =", m1.get("avg_efficiency"))
else:
    print("Call 1 Failed:", r1.text)

r2 = requests.get("http://localhost:8000/api/analytics/organization/health", headers=headers)
if r2.status_code == 200:
    m2 = r2.json().get("metrics", {})
    print("Call 2: Burnout =", m2.get("avg_burnout"), "Efficiency =", m2.get("avg_efficiency"))

print("\n--- Testing /api/reports/org.csv ---")
rcsv = requests.get("http://localhost:8000/api/reports/org.csv", headers=headers)
if rcsv.status_code == 200:
    print("CSV Preview:")
    print(rcsv.text[:300])
else:
    print("CSV Failed:", rcsv.text)
