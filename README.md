# AI-Powered Digital Twin for Employee Productivity
## Node.js Backend + Vanilla Frontend

A prototype web application for demonstrating HR dashboard functionality with employee productivity and burnout risk analysis.

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **CSV Parsing**: PapaParse (server-side)
- **Data Format**: CSV file

## Project Structure

```
├── server.js                          # Node.js Express server
├── package.json                       # Node.js dependencies
├── login.html                         # HR Login Page
├── dashboard.html                     # HR Dashboard Page
├── style.css                          # Styling for both pages
├── script.js                          # Frontend JavaScript
└── synthetic_it_company_300_employees.csv  # Employee data CSV file
```

## Installation

1. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   Or:
   ```bash
   node server.js
   ```

3. **Open your browser:**
   - Login page: `http://localhost:3000/login.html`
   - Dashboard: `http://localhost:3000/dashboard.html`

## Login Credentials

- **Email**: `hr@itcompany.com`
- **Password**: `hr123`

## API Endpoints

### POST `/api/login`
Login authentication endpoint.

**Request Body:**
```json
{
  "email": "hr@itcompany.com",
  "password": "hr123"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Login successful"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### GET `/api/employees`
Get all employee data with calculated productivity status and burnout risk.

**Success Response:**
```json
{
  "success": true,
  "data": [
    {
      "Employee_ID": "E001",
      "Department": "Engineering",
      "Job_Level": "Senior",
      "Productivity_Score": 82.5,
      "Stress_Level": 6.2,
      "Work_Life_Balance": 7.1,
      "Productivity_Status": "High",
      "Burnout_Risk": "Medium"
    },
    ...
  ],
  "total": 300
}
```

## Features

### Module 1: HR Login
- Login form with email and password
- API-based authentication
- Error message display for invalid credentials
- Redirects to dashboard on successful login

### Module 2: HR Dashboard
- Fetches employee data from backend API
- Displays employee data in a formatted table
- Calculates Productivity Status and Burnout Risk (server-side)
- Shows dashboard statistics (total employees, high productivity count, high burnout risk count)

## Logic Rules

### Productivity Status:
- **High**: Productivity_Score ≥ 75 (Green badge)
- **Medium**: Productivity_Score 50-74 (Yellow badge)
- **Low**: Productivity_Score < 50 (Red badge)

### Burnout Risk:
- **High**: Stress_Level ≥ 7 (Red badge)
- **Medium**: Stress_Level 4-6 (Yellow badge)
- **Low**: Stress_Level ≤ 3 (Green badge)

## CSV Data Format

The CSV file (`synthetic_it_company_300_employees.csv`) contains:
- Employee_ID
- Department
- Job_Level
- Work_Hours_Per_Week
- Meetings_Per_Week
- WFH_Days_Per_Week
- Productivity_Score
- Stress_Level
- Work_Life_Balance

## Dependencies

- **express**: Web framework for Node.js
- **cors**: Enable CORS for API requests
- **papaparse**: CSV parsing library
- **fs**: File system module (built-in)
- **path**: Path utilities (built-in)

## Development

The server runs on port 3000 by default. To change the port, modify the `PORT` constant in `server.js`.

## Notes

This is a prototype application for academic demonstration purposes. The code is designed to be simple, clear, and easy to explain during project reviews.

**Important**: 
- Make sure `synthetic_it_company_300_employees.csv` is in the root directory
- The backend server must be running for the frontend to work
- All CSV parsing and data processing happens on the server side
