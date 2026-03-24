import requests

# Try login as HR manager
login_resp = requests.post("http://localhost:8000/api/auth/login", json={"username":"hr", "password":"hr123"})
if login_resp.status_code == 200:
    token = login_resp.json()["access_token"]
    user = login_resp.json()["user"]
    print("Logged in as:", user["role"], "emp_id:", user.get("emp_id"))
    
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get("http://localhost:8000/api/reports/employee/EMP300.csv", headers=headers)
    print("Export EMP300.csv:", r.status_code, r.text)
else:
    print("Login failed", login_resp.status_code, login_resp.text)
