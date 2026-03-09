# FlowAI v3 — Enterprise Digital Twin Platform

Full-stack rebuild with **FastAPI + MongoDB + React + Firebase Google Auth + Gemini AI**.

```
flowai_v3/
├── backend/    FastAPI • Motor (async MongoDB) • Gemini 1.5 Flash
└── frontend/   React • Vite • Tailwind • Firebase Google Auth
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | ≥ 3.11 | python.org |
| Node.js | ≥ 18 | nodejs.org |
| MongoDB | ≥ 6.0 | mongodb.com/try/download/community **or** Atlas free tier |

---

## 1 · Firebase Setup (Google Auth)

1. Go to [Firebase Console](https://console.firebase.google.com) → **Add project**
2. Enable **Authentication** → Sign-in methods → **Google**
3. **Project Settings** → Your apps → **Add web app** → copy config
4. Note your **Project ID** (e.g. `my-app-12345`)

---

## 2 · Backend Setup

```bash
cd backend

# Copy and fill env
cp .env.example .env
# Edit .env: set MONGODB_URI, FIREBASE_PROJECT_ID, GEMINI_API_KEY

# Install Python deps
pip install -r requirements.txt

# Run (seeds MongoDB from CSV on first start)
uvicorn main:app --reload --port 8000
```

**On first startup the seeder will:**
- Insert 6022 activity events into `activity_events`
- Create 300 employee records in `employees`
- Compute digital twins for all 300 employees in `digital_twins`
- Create a demo admin user

**API docs:** http://localhost:8000/docs

### Key `.env` values

```env
MONGODB_URI=mongodb://localhost:27017     # or Atlas URI
MONGODB_DB=flowai
JWT_SECRET=<run: python -c "import secrets; print(secrets.token_hex(32))">
FIREBASE_PROJECT_ID=your-project-id      # from Firebase Console
GEMINI_API_KEY=AIza...                   # from aistudio.google.com
```

---

## 3 · Frontend Setup

```bash
cd frontend

# Copy and fill env
cp .env.example .env
# Edit .env: set Firebase config values

# Install Node deps
npm install

# Run dev server
npm run dev
```

Open: http://localhost:5173

### Key `.env` values

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_API_URL=http://localhost:8000
```

---

## 4 · Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **Create API key**
3. Copy and set `GEMINI_API_KEY` in `backend/.env`

---

## Architecture

```
Browser (React + Vite :5173)
  │  Firebase SDK → Google Sign-In popup → Firebase ID token
  │  POST /api/auth/google {id_token}
  ↓
FastAPI (:8000)
  │  Verify Firebase token via google-auth
  │  Issue app JWT (7-day)
  │  All subsequent requests: Bearer JWT
  ↓
MongoDB (motor async)
  ├── users            Google UID + role + emp_id
  ├── employees        300 employees from CSV
  ├── activity_events  6022 activity records (seeded from CSV)
  ├── digital_twins    Computed burnout/efficiency/battery per employee
  └── ai_insights      Cached Gemini responses (1-hour TTL)
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/google` | Exchange Firebase token → JWT |
| GET  | `/api/auth/me` | Current user |
| GET  | `/api/employees` | Paginated list with filters |
| GET  | `/api/employees/summary` | Org-wide stat cards |
| GET  | `/api/employees/{id}/stats` | Full stats for one employee |
| GET  | `/api/twins/org-summary` | Dept breakdown + at-risk list |
| GET  | `/api/twins/{id}` | Single digital twin |
| POST | `/api/twins/{id}/refresh` | Recompute twin (HR Manager) |
| POST | `/api/telemetry/ingest` | Ingest live agent event |
| GET  | `/api/telemetry/hr-overview` | Simple HR stats |
| POST | `/api/insights/generate` | Generate / return cached Gemini insight |

---

## Roles

| Role | Access |
|------|--------|
| **HR Manager** | All dashboards, employee list, AI insights, twin refresh |
| **Department Head** | All dashboards except admin operations |
| **Employee** | Own profile + twin only |

All new Google Sign-In users default to **HR Manager** for demo. Change via MongoDB Compass: `db.users.updateOne({email: "..."}, {$set: {role: "Employee", emp_id: "EMP001"}})`.

---

## Scoring Algorithms

**Efficiency** = (Productive + Productive (Contextual)) / Total × 100

**Burnout Score** (0-100, higher = worse):
- After-hours work penalty (max 30 pts)
- Distraction ratio penalty (max 25 pts)
- Context-switch rate penalty (max 25 pts)
- Short focus blocks penalty (max 10 pts)
- Low efficiency penalty (max 10 pts)

**Cognitive Battery** = max(100 − burnout × 0.75, 0)

**Risk Levels:** LOW (<35) · MEDIUM (35-54) · HIGH (55-74) · CRITICAL (≥75)
