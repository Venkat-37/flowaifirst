const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Hardcoded HR credentials
const HR_EMAIL = 'hr@itcompany.com';
const HR_PASSWORD = 'hr123';

// ============================================
// API ROUTES
// ============================================

// Login endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (email === HR_EMAIL && password === HR_PASSWORD) {
        res.json({
            success: true,
            message: 'Login successful'
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
});

// Get employee data endpoint
app.get('/api/employees', (req, res) => {
    const csvPath = path.join(__dirname, 'synthetic_it_company_300_employees.csv');

    // Check if CSV file exists
    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({
            success: false,
            message: 'CSV file not found'
        });
    }

    // Read CSV file
    const csvData = fs.readFileSync(csvPath, 'utf8');

    // Parse CSV using PapaParse
    Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            // Process employee data
            const processedEmployees = results.data.map(row => {
                // Parse raw data
                const productivityScore = parseFloat(row.Productivity_Score) || 0;
                const stressLevel = parseFloat(row.Stress_Level) || 0;
                const workLifeBalance = parseFloat(row.Work_Life_Balance) || 0;
                const workHours = parseFloat(row.Work_Hours_Per_Week) || 0;
                const meetings = parseFloat(row.Meetings_Per_Week) || 0;
                const wfhDays = parseFloat(row.WFH_Days_Per_Week) || 0;

                // ==========================================
                // TASK 1: ANALYTICAL SCORING ENGINE
                // ==========================================

                // Normalize factors to 0-100 scale
                
                // 1. Work Hours Impact (40%): Optimal 40-60h range mapped to score
                // Using linear mapping: 20h -> 0, 60h -> 100 (capped)
                const normWorkHours = Math.min(100, Math.max(0, (workHours - 20) / 40 * 100));

                // 2. Work Life Balance Impact (25%): 1-10 scale
                // Map 1 -> 0, 10 -> 100
                const normWLB = Math.min(100, Math.max(0, (workLifeBalance - 1) / 9 * 100));

                // 3. Meeting Load Impact (20%) [Inverse]: Fewer meetings = Better focus
                // Map 0 meetings -> 100, 20+ meetings -> 0
                const normMeetings = Math.min(100, Math.max(0, (20 - Math.min(20, meetings)) / 20 * 100));

                // 4. WFH Days Impact (15%): More WFH = Higher autonomy
                // Map 0 days -> 0, 5 days -> 100
                const normWFH = Math.min(100, Math.max(0, (wfhDays / 5) * 100));

                // Calculate Weighted Productivity Score
                let calculatedProductivity = (
                    (normWorkHours * 0.40) +
                    (normWLB * 0.25) +
                    (normMeetings * 0.20) +
                    (normWFH * 0.15)
                );
                
                // Ensure score is 0-100
                calculatedProductivity = Math.min(100, Math.max(0, calculatedProductivity));


                // ==========================================
                // TASK 2: DERIVED STRESS INDEX
                // ==========================================

                // 1. Excess Work Hours (35%): > 40 hours increases stress
                // Map 40h -> 0, 60h+ -> 10
                const stressWorkHours = Math.min(10, Math.max(0, (workHours - 40) / 20 * 10));

                // 2. Low Work-Life Balance (30%): Lower WLB = Higher Stress
                // Map 10 (Good) -> 0, 1 (Bad) -> 10
                const stressWLB = Math.min(10, Math.max(0, (10 - workLifeBalance) / 9 * 10));

                // 3. Meeting Load (20%): More meetings = More stress
                // Map 0 -> 0, 20+ -> 10
                const stressMeetings = Math.min(10, Math.max(0, meetings / 20 * 10));

                // 4. Productivity Pressure (15%): Inverse of Calculated Productivity
                // Low productivity (struggling) -> High Stress (10)
                const stressPressure = (100 - calculatedProductivity) / 10;

                // Calculate Weighted Stress Index
                let derivedStress = (
                    (stressWorkHours * 0.35) +
                    (stressWLB * 0.30) +
                    (stressMeetings * 0.20) +
                    (stressPressure * 0.15)
                );

                // Ensure score is 0-10
                derivedStress = Math.min(10, Math.max(0, derivedStress));


                // ==========================================
                // TASK 3: UPDATE STATUS LOGIC
                // ==========================================

                // Productivity Status based on CALCULATED score
                let productivityStatus = 'Low';
                if (calculatedProductivity >= 75) {
                    productivityStatus = 'High'; // Green
                } else if (calculatedProductivity >= 50) {
                    productivityStatus = 'Medium'; // Yellow
                }

                // Burnout Risk based on DERIVED stress
                let burnoutRisk = 'Low';
                if (derivedStress >= 7) {
                    burnoutRisk = 'High'; // Red
                } else if (derivedStress >= 4) {
                    burnoutRisk = 'Medium'; // Yellow
                }
                
                // Return enriched object
                return {
                    Employee_ID: row.Employee_ID || '',
                    Department: row.Department || '',
                    Job_Level: row.Job_Level || '',
                    Work_Hours_Per_Week: workHours,
                    Meetings_Per_Week: meetings,
                    WFH_Days_Per_Week: wfhDays,
                    Productivity_Score: productivityScore, // Original
                    Stress_Level: stressLevel,             // Original
                    Work_Life_Balance: workLifeBalance,
                    
                    // New Analytical Fields
                    Calculated_Productivity: parseFloat(calculatedProductivity.toFixed(2)),
                    Derived_Stress: parseFloat(derivedStress.toFixed(2)),
                    
                    // Updated Statuses
                    Productivity_Status: productivityStatus,
                    Burnout_Risk: burnoutRisk
                };
            });

            res.json({
                success: true,
                data: processedEmployees,
                total: processedEmployees.length
            });
        },
        error: (error) => {
            res.status(500).json({
                success: false,
                message: 'Error parsing CSV: ' + error.message
            });
        }
    });
});

// Root route - serve login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Login page: http://localhost:${PORT}/login.html`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
});
