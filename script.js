// ============================================
// LOGIN PAGE FUNCTIONALITY
// ============================================

// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

// Initialize login form when page loads
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // Clear previous error
            errorMessage.style.display = 'none';
            
            // Call login API
            fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Redirect to dashboard on successful login
                    window.location.href = 'dashboard.html';
                } else {
                    // Show error message
                    errorMessage.textContent = data.message || 'Invalid credentials';
                    errorMessage.style.display = 'block';
                }
            })
            .catch(error => {
                errorMessage.textContent = 'Error connecting to server. Make sure the backend is running.';
                errorMessage.style.display = 'block';
                console.error('Login error:', error);
            });
        });
    }
});

// ============================================
// DASHBOARD PAGE FUNCTIONALITY
// ============================================

// Global variables
let allEmployees = [];
let filteredEmployees = [];
let currentPage = 1;
const itemsPerPage = 10;
let selectedTwinCategory = null;

function loadCSVData() {
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    // Show loading message
    if (loadingMessage) loadingMessage.style.display = 'block';
    if (errorMessage) errorMessage.style.display = 'none';
    
    // Hide all possible dashboard elements (safely)
    const elementsToHide = [
        'dashboardStats', 'tableContainer', 'filterPanel', 'digitalTwinSection',
        'healthSnapshot', 'criticalAttention', 'departmentOverview', 'aiInsights'
    ];
    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Fetch employee data from API
    fetch(`${API_BASE_URL}/employees`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load employee data');
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.data) {
                processEmployeeData(data.data);
            } else {
                showError(data.message || 'No employee data found');
            }
        })
        .catch(error => {
            showError('Failed to load employee data: ' + error.message + 
                     '<br><small>Make sure the backend server is running on http://localhost:3000</small>');
            console.error('Error loading employee data:', error);
            // Always hide loading message on error
            if (loadingMessage) loadingMessage.style.display = 'none';
        });
}

function processEmployeeData(data) {
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    // Hide loading message
    if (loadingMessage) loadingMessage.style.display = 'none';
    
    if (!data || data.length === 0) {
        showError('No employee data found in CSV file');
        return;
    }
    
    // Store all employees globally
    allEmployees = data;
    filteredEmployees = [...allEmployees];
    
    // Get current page name - handle different scenarios
    let currentPage = window.location.pathname.split('/').pop();
    if (!currentPage || currentPage === '' || currentPage === 'index.html') {
        currentPage = 'dashboard.html';
    }
    
    console.log('Processing data for page:', currentPage, 'Data length:', data.length);
    
    // Populate department filter (needed for pages that use filters)
    try {
        populateDepartmentFilter();
    } catch (error) {
        console.warn('Error populating department filter:', error);
    }
    
    // Page-specific initialization
    try {
        if (currentPage === 'dashboard.html') {
            console.log('Initializing dashboard page');
            initDashboardPage();
        } else if (currentPage === 'ai-insights.html') {
            console.log('Initializing AI insights page');
            initAIInsightsPage();
        } else if (currentPage === 'department-analytics.html') {
            console.log('Initializing department analytics page');
            initDepartmentAnalyticsPage();
        } else if (currentPage === 'employee-explorer.html') {
            console.log('Initializing employee explorer page');
            initEmployeeExplorerPage();
        } else {
            // Default to dashboard if page not recognized
            console.warn('Unknown page:', currentPage, '- defaulting to dashboard');
            initDashboardPage();
        }
        console.log('Page initialization complete');
    } catch (error) {
        console.error('Error initializing page:', error);
        showError('Error initializing page: ' + error.message);
    }
}

function initDashboardPage() {
    const dashboardStats = document.getElementById('dashboardStats');
    const digitalTwinSection = document.getElementById('digitalTwinSection');
    const healthSnapshot = document.getElementById('healthSnapshot');
    const criticalAttention = document.getElementById('criticalAttention');
    
    // Update statistics
    updateStatistics(allEmployees);
    
    // Display Digital Twin labels (compact)
    displayDigitalTwinLabels(allEmployees);
    
    // Update Organization Health Snapshot
    updateHealthSnapshot(allEmployees);
    
    // Update Critical Attention Required
    updateCriticalAttention(allEmployees);
    
    // Show dashboard elements
    if (dashboardStats) dashboardStats.style.display = 'grid';
    if (digitalTwinSection) digitalTwinSection.style.display = 'block';
    if (healthSnapshot) healthSnapshot.style.display = 'block';
    if (criticalAttention) criticalAttention.style.display = 'block';
}

function initAIInsightsPage() {
    const digitalTwinSection = document.getElementById('digitalTwinSection');
    const aiInsights = document.getElementById('aiInsights');
    
    // Display Digital Twin labels (full)
    displayDigitalTwinLabels(allEmployees);
    
    // Update AI Insights & Recommendations
    updateAIInsights(allEmployees);
    
    // Show page elements
    if (digitalTwinSection) digitalTwinSection.style.display = 'block';
    if (aiInsights) aiInsights.style.display = 'block';
}

function initDepartmentAnalyticsPage() {
    const departmentOverview = document.getElementById('departmentOverview');
    
    // Update Department Performance Overview
    updateDepartmentOverview(allEmployees);
    
    // Show page elements
    if (departmentOverview) departmentOverview.style.display = 'block';
}

function initEmployeeExplorerPage() {
    const filterPanel = document.getElementById('filterPanel');
    const tableContainer = document.getElementById('tableContainer');
    
    // Populate department filter
    populateDepartmentFilter();
    
    // Reset to first page
    currentPage = 1;
    
    // Display table
    displayEmployeeTable(filteredEmployees);
    
    // Setup filter listeners
    setupFilterListeners();
    
    // Show page elements
    if (filterPanel) filterPanel.style.display = 'block';
    if (tableContainer) tableContainer.style.display = 'block';
}

function populateDepartmentFilter() {
    const departmentFilter = document.getElementById('departmentFilter');
    const departments = [...new Set(allEmployees.map(e => e.Department))].sort();
    
    // Clear existing options except "All Departments"
    departmentFilter.innerHTML = '<option value="">All Departments</option>';
    
    departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        departmentFilter.appendChild(option);
    });
}

function setupFilterListeners() {
    const searchInput = document.getElementById('searchInput');
    const departmentFilter = document.getElementById('departmentFilter');
    const productivityFilter = document.getElementById('productivityFilter');
    const burnoutFilter = document.getElementById('burnoutFilter');
    
    searchInput.addEventListener('input', applyFilters);
    departmentFilter.addEventListener('change', applyFilters);
    productivityFilter.addEventListener('change', applyFilters);
    burnoutFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
    const searchValue = document.getElementById('searchInput').value.toLowerCase();
    const departmentValue = document.getElementById('departmentFilter').value;
    const productivityValue = document.getElementById('productivityFilter').value;
    const burnoutValue = document.getElementById('burnoutFilter').value;
    
    filteredEmployees = allEmployees.filter(employee => {
        const matchesSearch = !searchValue || employee.Employee_ID.toLowerCase().includes(searchValue);
        const matchesDepartment = !departmentValue || employee.Department === departmentValue;
        const matchesProductivity = !productivityValue || employee.Productivity_Status === productivityValue;
        const matchesBurnout = !burnoutValue || employee.Burnout_Risk === burnoutValue;
        
        return matchesSearch && matchesDepartment && matchesProductivity && matchesBurnout;
    });
    
    // Reset to first page when filters change
    currentPage = 1;
    displayEmployeeTable(filteredEmployees);
    updateTableCount();
    updatePagination();
    // Update health snapshot with filtered data
    updateHealthSnapshot(filteredEmployees);
    // Update critical attention with filtered data
    updateCriticalAttention(filteredEmployees);
    // Update department overview with filtered data
    updateDepartmentOverview(filteredEmployees);
    // Update AI insights with filtered data
    updateAIInsights(filteredEmployees);
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('departmentFilter').value = '';
    document.getElementById('productivityFilter').value = '';
    document.getElementById('burnoutFilter').value = '';
    
    // Clear twin category selection
    selectedTwinCategory = null;
    
    filteredEmployees = [...allEmployees];
    currentPage = 1;
    displayEmployeeTable(filteredEmployees);
    updateTableCount();
    updatePagination();
    // Update health snapshot with all employees
    updateHealthSnapshot(allEmployees);
    // Update critical attention with all employees
    updateCriticalAttention(allEmployees);
    // Update department overview with all employees
    updateDepartmentOverview(allEmployees);
    // Update AI insights with all employees
    updateAIInsights(allEmployees);
    // Update twin labels to remove selected state
    displayDigitalTwinLabels(allEmployees);
}

function updateStatistics(employees) {
    const totalEmployees = employees.length;
    const highProductivity = employees.filter(e => e.Productivity_Status === 'High').length;
    const highBurnoutRisk = employees.filter(e => e.Burnout_Risk === 'High').length;
    
    document.getElementById('totalEmployees').textContent = totalEmployees;
    document.getElementById('highProductivity').textContent = highProductivity;
    document.getElementById('highBurnoutRisk').textContent = highBurnoutRisk;
}

function displayDigitalTwinLabels(employees) {
    const twinLabelsContainer = document.getElementById('twinLabels');
    twinLabelsContainer.innerHTML = '';
    
    // Calculate labels based on rules
    const labels = [];
    
    // Focus-Oriented: High productivity, low stress
    const focusOriented = employees.filter(e => 
        e.Productivity_Status === 'High' && e.Burnout_Risk === 'Low'
    ).length;
    if (focusOriented > 0) {
        labels.push({ 
            text: 'Focus-Oriented', 
            count: focusOriented,
            tooltip: 'Employees with high productivity and low stress levels',
            filter: () => filterByTwinCategory('Focus-Oriented')
        });
    }
    
    // Meeting-Heavy: High meetings (approximate - using stress as proxy)
    const meetingHeavy = employees.filter(e => 
        e.Stress_Level >= 6 && e.Meetings_Per_Week >= 10
    ).length;
    if (meetingHeavy > 0) {
        labels.push({ 
            text: 'Meeting-Heavy', 
            count: meetingHeavy,
            tooltip: 'Employees with high stress levels and frequent meetings',
            filter: () => filterByTwinCategory('Meeting-Heavy')
        });
    }
    
    // Balanced: Medium productivity, medium-low stress
    const balanced = employees.filter(e => 
        e.Productivity_Status === 'Medium' && e.Burnout_Risk !== 'High'
    ).length;
    if (balanced > 0) {
        labels.push({ 
            text: 'Balanced', 
            count: balanced,
            tooltip: 'Employees with moderate productivity and manageable stress',
            filter: () => filterByTwinCategory('Balanced')
        });
    }
    
    // Burnout-Prone: High stress, low work-life balance
    const burnoutProne = employees.filter(e => 
        e.Burnout_Risk === 'High' || e.Work_Life_Balance < 5
    ).length;
    if (burnoutProne > 0) {
        labels.push({ 
            text: 'Burnout-Prone', 
            count: burnoutProne,
            tooltip: 'Employees showing high stress and low work-life balance',
            filter: () => filterByTwinCategory('Burnout-Prone')
        });
    }
    
    // Display labels
    labels.forEach(label => {
        const labelElement = document.createElement('div');
        labelElement.className = 'twin-label';
        if (selectedTwinCategory === label.text) {
            labelElement.classList.add('twin-label-selected');
        }
        labelElement.setAttribute('data-twin-category', label.text);
        labelElement.setAttribute('data-tooltip', label.tooltip);
        labelElement.textContent = `${label.text} (${label.count})`;
        labelElement.addEventListener('click', (e) => {
            e.stopPropagation();
            label.filter();
        });
        twinLabelsContainer.appendChild(labelElement);
    });
}

function filterByTwinCategory(category) {
    // Toggle selection - if same category clicked, clear filter
    if (selectedTwinCategory === category) {
        selectedTwinCategory = null;
        clearFilters();
        return;
    }
    
    // Set selected category
    selectedTwinCategory = category;
    
    // Clear other filters first
    document.getElementById('searchInput').value = '';
    document.getElementById('departmentFilter').value = '';
    document.getElementById('productivityFilter').value = '';
    document.getElementById('burnoutFilter').value = '';
    
    // Apply filter based on category
    let filtered = [];
    
    switch(category) {
        case 'Focus-Oriented':
            filtered = allEmployees.filter(e => 
                e.Productivity_Status === 'High' && e.Burnout_Risk === 'Low'
            );
            document.getElementById('productivityFilter').value = 'High';
            document.getElementById('burnoutFilter').value = 'Low';
            break;
            
        case 'Meeting-Heavy':
            filtered = allEmployees.filter(e => 
                e.Stress_Level >= 6 && e.Meetings_Per_Week >= 10
            );
            // Note: This filter uses stress level and meetings, which aren't directly filterable
            // So we'll filter by stress level >= 6 as closest match
            break;
            
        case 'Balanced':
            filtered = allEmployees.filter(e => 
                e.Productivity_Status === 'Medium' && e.Burnout_Risk !== 'High'
            );
            document.getElementById('productivityFilter').value = 'Medium';
            break;
            
        case 'Burnout-Prone':
            filtered = allEmployees.filter(e => 
                e.Burnout_Risk === 'High' || e.Work_Life_Balance < 5
            );
            document.getElementById('burnoutFilter').value = 'High';
            break;
    }
    
    filteredEmployees = filtered;
    currentPage = 1;
    
    // Update UI
    displayEmployeeTable(filteredEmployees);
    updateTableCount();
    updatePagination();
    updateHealthSnapshot(filteredEmployees);
    updateCriticalAttention(filteredEmployees);
    
    // Update twin labels to show selected state
    displayDigitalTwinLabels(allEmployees);
    
    // Scroll to table
    document.querySelector('.table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function displayEmployeeTable(employees) {
    const tableBody = document.getElementById('employeeTableBody');
    tableBody.innerHTML = ''; // Clear existing rows
    
    // Calculate pagination
    const totalPages = Math.ceil(employees.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, employees.length);
    const currentPageEmployees = employees.slice(startIndex, endIndex);
    
    // Display only current page employees
    currentPageEmployees.forEach((employee, index) => {
        const row = document.createElement('tr');
        const globalIndex = startIndex + index;
        row.setAttribute('data-employee-index', globalIndex);
        row.addEventListener('click', () => openEmployeeModal(employee));
        
        row.innerHTML = `
            <td>${employee.Employee_ID}</td>
            <td>${employee.Department}</td>
            <td>${employee.Job_Level}</td>
            <td>${employee.Productivity_Score.toFixed(1)}</td>
            <td>${employee.Stress_Level.toFixed(1)}</td>
            <td>${employee.Work_Life_Balance.toFixed(1)}</td>
            <td>
                <span class="status-badge status-${employee.Productivity_Status.toLowerCase()}">
                    ${employee.Productivity_Status}
                </span>
            </td>
            <td>
                <span class="risk-badge risk-${employee.Burnout_Risk.toLowerCase()}">
                    ${employee.Burnout_Risk}
                </span>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    updateTableCount();
    updatePagination();
}

function updateTableCount() {
    const tableCount = document.getElementById('tableCount');
    const totalCount = filteredEmployees.length;
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, totalCount);
    
    if (totalCount === 0) {
        tableCount.textContent = 'No employees found';
    } else {
        tableCount.textContent = `Showing ${startIndex}-${endIndex} of ${totalCount} employees`;
    }
}

function updatePagination() {
    const paginationContainer = document.getElementById('paginationContainer');
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationNumbers = document.getElementById('paginationNumbers');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    const totalCount = filteredEmployees.length;
    const totalPages = Math.ceil(totalCount / itemsPerPage);
    const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, totalCount);
    
    // Show/hide pagination
    if (totalCount === 0) {
        paginationContainer.style.display = 'none';
        return;
    } else {
        paginationContainer.style.display = 'flex';
    }
    
    // Update pagination info
    paginationInfo.textContent = `Showing ${startIndex}-${endIndex} of ${totalCount} employees`;
    
    // Update Previous button
    prevBtn.disabled = currentPage === 1;
    
    // Update Next button
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    
    // Generate page numbers
    paginationNumbers.innerHTML = '';
    
    // Show max 5 page numbers at a time
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    // Adjust if we're near the end
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }
    
    // First page button
    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-number';
        firstBtn.textContent = '1';
        firstBtn.onclick = () => goToPage(1);
        paginationNumbers.appendChild(firstBtn);
        
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationNumbers.appendChild(ellipsis);
        }
    }
    
    // Page number buttons
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = 'pagination-number';
        if (i === currentPage) {
            pageBtn.classList.add('active');
        }
        pageBtn.textContent = i;
        pageBtn.onclick = () => goToPage(i);
        paginationNumbers.appendChild(pageBtn);
    }
    
    // Last page button
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationNumbers.appendChild(ellipsis);
        }
        
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-number';
        lastBtn.textContent = totalPages;
        lastBtn.onclick = () => goToPage(totalPages);
        paginationNumbers.appendChild(lastBtn);
    }
}

function goToPage(page) {
    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayEmployeeTable(filteredEmployees);
        // Scroll to top of table
        document.querySelector('.table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
    if (currentPage < totalPages) {
        goToPage(currentPage + 1);
    }
}

function previousPage() {
    if (currentPage > 1) {
        goToPage(currentPage - 1);
    }
}

function getDigitalTwinProfile(employee) {
    // Focus-Oriented: High productivity, low stress
    if (employee.Productivity_Status === 'High' && employee.Burnout_Risk === 'Low') {
        return {
            type: 'Focus-Oriented',
            icon: '🎯',
            className: 'focus-oriented',
            description: 'Highly productive with good stress management. Ideal for independent deep work.'
        };
    }
    
    // Meeting-Heavy: High meetings (approximate - using stress as proxy if meetings not available or high)
    // Note: detailed logic matches displayDigitalTwinLabels
    if (employee.Stress_Level >= 6 && employee.Meetings_Per_Week >= 10) {
        return {
            type: 'Meeting-Heavy',
            icon: '📅',
            className: 'meeting-heavy',
            description: 'High meeting load contributing to stress. Risk of fragmentation.'
        };
    }
    
    // Burnout-Prone: High stress, low work-life balance
    if (employee.Burnout_Risk === 'High' || employee.Work_Life_Balance < 5) {
        return {
            type: 'Burnout-Prone',
            icon: '🔥',
            className: 'burnout-prone',
            description: 'Showing signs of exhaustion. Critical need for workload adjustment.'
        };
    }

    // Balanced: Medium productivity, medium-low stress
    if (employee.Productivity_Status === 'Medium' && employee.Burnout_Risk !== 'High') {
        return {
            type: 'Balanced',
            icon: '⚖️',
            className: 'balanced',
            description: 'Steady performer with sustainable work habits.'
        };
    }
    
    // Default / Unclassified
    return {
        type: 'General',
        icon: '👤',
        className: 'balanced',
        description: 'Standard employee profile.'
    };
}

function getRecommendation(employee, twinProfile) {
    if (employee.Burnout_Risk === 'High') {
        return "Schedule an urgent 1:1 welfare check with specific focus on workload reduction and mandatory time off. Consider temporary role adjustment to prevent further deterioration.";
    }
    
    if (twinProfile.type === 'Meeting-Heavy') {
        return "Audit meeting schedule and suggest implementing 'No-Meeting Wednesdays' to increase focus time. Review meeting necessity and consider async alternatives where possible.";
    }
    
    if (employee.Productivity_Status === 'Low') {
        return "Identify blockers and potential need for upskilling or clearer goal setting. Schedule a performance review to understand challenges and provide targeted support.";
    }
    
    if (twinProfile.type === 'Focus-Oriented') {
        return "Recognize high performance and consider this employee for mentorship or leadership opportunities. Maintain current work patterns that support their productivity.";
    }
    
    if (employee.Work_Life_Balance < 4) {
        return "Work-life balance is critical. Encourage logging off on time and respecting boundaries. Review workload distribution and consider flexible work arrangements.";
    }
    
    return "Continue monitoring. Current trajectory is sustainable. Maintain regular check-ins to ensure continued well-being.";
}

function openEmployeeModal(employee) {
    const modal = document.getElementById('employeeModal');
    const modalBody = document.getElementById('modalBody');
    
    // Find additional data from original employee data
    const fullEmployee = allEmployees.find(e => e.Employee_ID === employee.Employee_ID) || employee;
    const twinProfile = getDigitalTwinProfile(fullEmployee);
    const recommendation = getRecommendation(fullEmployee, twinProfile);
    
    modalBody.innerHTML = `
        <!-- Basic Information Section -->
        <div class="modal-section">
            <div class="modal-section-header">
                <h3 class="modal-section-title">Employee Information</h3>
            </div>
            <div class="modal-info-grid">
                <div class="modal-info-item">
                    <span class="modal-info-label">Employee ID</span>
                    <span class="modal-info-value">${fullEmployee.Employee_ID}</span>
                </div>
                <div class="modal-info-item">
                    <span class="modal-info-label">Department</span>
                    <span class="modal-info-value">${fullEmployee.Department}</span>
                </div>
                <div class="modal-info-item">
                    <span class="modal-info-label">Job Level</span>
                    <span class="modal-info-value">${fullEmployee.Job_Level}</span>
                </div>
                ${fullEmployee.Work_Hours_Per_Week ? `
                <div class="modal-info-item">
                    <span class="modal-info-label">Work Hours/Week</span>
                    <span class="modal-info-value">${fullEmployee.Work_Hours_Per_Week}</span>
                </div>
                ` : ''}
                ${fullEmployee.Meetings_Per_Week ? `
                <div class="modal-info-item">
                    <span class="modal-info-label">Meetings/Week</span>
                    <span class="modal-info-value">${fullEmployee.Meetings_Per_Week}</span>
                </div>
                ` : ''}
                ${fullEmployee.WFH_Days_Per_Week ? `
                <div class="modal-info-item">
                    <span class="modal-info-label">WFH Days/Week</span>
                    <span class="modal-info-value">${fullEmployee.WFH_Days_Per_Week}</span>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- Key Metrics Section -->
        <div class="modal-section">
            <div class="modal-section-header">
                <h3 class="modal-section-title">Key Metrics</h3>
            </div>
            <div class="modal-metrics-grid">
                <div class="modal-metric-card">
                    <div class="modal-metric-icon">📊</div>
                    <div class="modal-metric-content">
                        <span class="modal-metric-label">Productivity Score</span>
                        <span class="modal-metric-value">${fullEmployee.Productivity_Score.toFixed(1)}</span>
                        <span class="modal-metric-badge status-badge status-${fullEmployee.Productivity_Status.toLowerCase()}">
                            ${fullEmployee.Productivity_Status}
                        </span>
                    </div>
                </div>
                <div class="modal-metric-card">
                    <div class="modal-metric-icon">😰</div>
                    <div class="modal-metric-content">
                        <span class="modal-metric-label">Stress Level</span>
                        <span class="modal-metric-value">${fullEmployee.Stress_Level.toFixed(1)}</span>
                        <span class="modal-metric-badge risk-badge risk-${fullEmployee.Burnout_Risk.toLowerCase()}">
                            ${fullEmployee.Burnout_Risk} Risk
                        </span>
                    </div>
                </div>
                <div class="modal-metric-card">
                    <div class="modal-metric-icon">⚖️</div>
                    <div class="modal-metric-content">
                        <span class="modal-metric-label">Work-Life Balance</span>
                        <span class="modal-metric-value">${fullEmployee.Work_Life_Balance.toFixed(1)}</span>
                        <span class="modal-metric-badge ${fullEmployee.Work_Life_Balance >= 7 ? 'balance-good' : fullEmployee.Work_Life_Balance >= 5 ? 'balance-medium' : 'balance-poor'}">
                            ${fullEmployee.Work_Life_Balance >= 7 ? 'Good' : fullEmployee.Work_Life_Balance >= 5 ? 'Fair' : 'Poor'}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Digital Twin Summary Section -->
        <div class="modal-section">
            <div class="modal-section-header">
                <h3 class="modal-section-title">Digital Twin Summary</h3>
                <span class="ml-badge-small">Rule-Based (ML-Ready)</span>
            </div>
            <div class="digital-twin-summary ${twinProfile.className}">
                <div class="twin-icon-large">${twinProfile.icon}</div>
                <div class="twin-info">
                    <div class="twin-type">${twinProfile.type}</div>
                    <div class="twin-desc">${twinProfile.description}</div>
                </div>
            </div>
        </div>

        <!-- Recommendation Section -->
        <div class="modal-section">
            <div class="recommendation-box">
                <div class="recommendation-header">
                    <div class="recommendation-icon">💡</div>
                    <h4 class="recommendation-title">AI-Powered Recommendation</h4>
                </div>
                <div class="recommendation-text">${recommendation}</div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('employeeModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('employeeModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
});

function updateHealthSnapshot(employees) {
    if (!employees || employees.length === 0) {
        return;
    }
    
    // Calculate Average Productivity Score
    const avgProductivity = employees.reduce((sum, e) => sum + e.Productivity_Score, 0) / employees.length;
    document.getElementById('avgProductivity').textContent = avgProductivity.toFixed(1);
    updateProductivityIndicator(avgProductivity);
    
    // Calculate Percentage of High Burnout Risk
    const highBurnoutCount = employees.filter(e => e.Burnout_Risk === 'High').length;
    const burnoutPercentage = (highBurnoutCount / employees.length) * 100;
    document.getElementById('burnoutPercentage').textContent = burnoutPercentage.toFixed(1) + '%';
    updateBurnoutIndicator(burnoutPercentage);
    
    // Calculate Average Stress Level
    const avgStress = employees.reduce((sum, e) => sum + e.Stress_Level, 0) / employees.length;
    document.getElementById('avgStress').textContent = avgStress.toFixed(1);
    updateStressIndicator(avgStress);
    
    // Calculate Average Work-Life Balance
    const avgBalance = employees.reduce((sum, e) => sum + e.Work_Life_Balance, 0) / employees.length;
    document.getElementById('avgBalance').textContent = avgBalance.toFixed(1);
    updateBalanceIndicator(avgBalance);
}

function updateProductivityIndicator(score) {
    const indicator = document.getElementById('productivityIndicator');
    indicator.className = 'health-indicator';
    
    if (score >= 75) {
        indicator.classList.add('indicator-green');
        indicator.textContent = 'Excellent';
    } else if (score >= 50) {
        indicator.classList.add('indicator-yellow');
        indicator.textContent = 'Good';
    } else {
        indicator.classList.add('indicator-red');
        indicator.textContent = 'Needs Improvement';
    }
}

function updateBurnoutIndicator(percentage) {
    const indicator = document.getElementById('burnoutIndicator');
    indicator.className = 'health-indicator';
    
    if (percentage < 15) {
        indicator.classList.add('indicator-green');
        indicator.textContent = 'Low Risk';
    } else if (percentage < 30) {
        indicator.classList.add('indicator-yellow');
        indicator.textContent = 'Moderate Risk';
    } else {
        indicator.classList.add('indicator-red');
        indicator.textContent = 'High Risk';
    }
}

function updateStressIndicator(level) {
    const indicator = document.getElementById('stressIndicator');
    indicator.className = 'health-indicator';
    
    if (level <= 3) {
        indicator.classList.add('indicator-green');
        indicator.textContent = 'Low';
    } else if (level <= 6) {
        indicator.classList.add('indicator-yellow');
        indicator.textContent = 'Moderate';
    } else {
        indicator.classList.add('indicator-red');
        indicator.textContent = 'High';
    }
}

function updateBalanceIndicator(score) {
    const indicator = document.getElementById('balanceIndicator');
    indicator.className = 'health-indicator';
    
    if (score >= 7) {
        indicator.classList.add('indicator-green');
        indicator.textContent = 'Excellent';
    } else if (score >= 5) {
        indicator.classList.add('indicator-yellow');
        indicator.textContent = 'Good';
    } else {
        indicator.classList.add('indicator-red');
        indicator.textContent = 'Poor';
    }
}

function updateCriticalAttention(employees) {
    if (!employees || employees.length === 0) {
        document.getElementById('criticalList').innerHTML = '<div class="critical-empty">No critical cases found</div>';
        document.getElementById('criticalCount').textContent = '0 employees';
        return;
    }
    
    // Find employees meeting critical criteria
    const criticalEmployees = employees.filter(employee => {
        return employee.Burnout_Risk === 'High' || 
               employee.Stress_Level >= 8 || 
               employee.Productivity_Status === 'Low';
    });
    
    // Sort by priority: High Burnout > High Stress > Low Productivity
    criticalEmployees.sort((a, b) => {
        // Priority scoring
        const getPriority = (emp) => {
            let score = 0;
            if (emp.Burnout_Risk === 'High') score += 100;
            if (emp.Stress_Level >= 8) score += 50;
            if (emp.Productivity_Status === 'Low') score += 25;
            return score;
        };
        return getPriority(b) - getPriority(a);
    });
    
    // Take top 7 employees
    const topCritical = criticalEmployees.slice(0, 7);
    
    // Update count
    document.getElementById('criticalCount').textContent = `${topCritical.length} employee${topCritical.length !== 1 ? 's' : ''}`;
    
    // Display list
    const criticalList = document.getElementById('criticalList');
    criticalList.innerHTML = '';
    
    if (topCritical.length === 0) {
        criticalList.innerHTML = '<div class="critical-empty">No critical cases found</div>';
        return;
    }
    
    topCritical.forEach(employee => {
        const reasons = [];
        if (employee.Burnout_Risk === 'High') reasons.push('Burnout-Prone');
        if (employee.Stress_Level >= 8) reasons.push('High Stress');
        if (employee.Productivity_Status === 'Low') reasons.push('Low Productivity');
        
        const listItem = document.createElement('div');
        listItem.className = 'critical-item';
        listItem.setAttribute('data-employee-id', employee.Employee_ID);
        listItem.addEventListener('click', () => scrollToEmployee(employee.Employee_ID));
        
        listItem.innerHTML = `
            <div class="critical-item-icon">⚠️</div>
            <div class="critical-item-content">
                <div class="critical-item-header">
                    <span class="critical-employee-id">${employee.Employee_ID}</span>
                    <span class="critical-department">${employee.Department}</span>
                </div>
                <div class="critical-reasons">
                    ${reasons.map(reason => `<span class="critical-reason-badge">${reason}</span>`).join('')}
                </div>
            </div>
            <div class="critical-item-arrow">→</div>
        `;
        
        criticalList.appendChild(listItem);
    });
}

function scrollToEmployee(employeeId) {
    // Find the employee in the current filtered list
    const employeeIndex = filteredEmployees.findIndex(e => e.Employee_ID === employeeId);
    
    if (employeeIndex === -1) {
        // Employee not in current filtered view, clear filters and try again
        clearFilters();
        setTimeout(() => {
            const newIndex = filteredEmployees.findIndex(e => e.Employee_ID === employeeId);
            if (newIndex !== -1) {
                const targetPage = Math.floor(newIndex / itemsPerPage) + 1;
                goToPage(targetPage);
                setTimeout(() => highlightEmployeeRow(employeeId), 300);
            }
        }, 100);
        return;
    }
    
    // Calculate which page the employee is on
    const targetPage = Math.floor(employeeIndex / itemsPerPage) + 1;
    
    // Navigate to that page
    if (targetPage !== currentPage) {
        goToPage(targetPage);
        setTimeout(() => highlightEmployeeRow(employeeId), 300);
    } else {
        highlightEmployeeRow(employeeId);
    }
}

function highlightEmployeeRow(employeeId) {
    // Remove any existing highlights
    document.querySelectorAll('.employee-table tbody tr').forEach(row => {
        row.classList.remove('highlighted-row');
    });
    
    // Find and highlight the row
    const rows = document.querySelectorAll('.employee-table tbody tr');
    rows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell && firstCell.textContent.trim() === employeeId) {
            row.classList.add('highlighted-row');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Remove highlight after 3 seconds
            setTimeout(() => {
                row.classList.remove('highlighted-row');
            }, 3000);
        }
    });
}

function updateDepartmentOverview(employees) {
    if (!employees || employees.length === 0) {
        document.getElementById('departmentGrid').innerHTML = '<div class="department-empty">No department data available</div>';
        return;
    }
    
    // Get unique departments
    const departments = [...new Set(employees.map(e => e.Department))].sort();
    
    // Calculate stats for each department
    const departmentStats = departments.map(dept => {
        const deptEmployees = employees.filter(e => e.Department === dept);
        const avgProductivity = deptEmployees.reduce((sum, e) => sum + e.Productivity_Score, 0) / deptEmployees.length;
        const highBurnoutCount = deptEmployees.filter(e => e.Burnout_Risk === 'High').length;
        const burnoutPercentage = (highBurnoutCount / deptEmployees.length) * 100;
        
        return {
            name: dept,
            avgProductivity: avgProductivity,
            highBurnoutCount: highBurnoutCount,
            totalEmployees: deptEmployees.length,
            burnoutPercentage: burnoutPercentage
        };
    });
    
    // Sort by average productivity (descending)
    departmentStats.sort((a, b) => b.avgProductivity - a.avgProductivity);
    
    // Display department cards
    const departmentGrid = document.getElementById('departmentGrid');
    departmentGrid.innerHTML = '';
    
    departmentStats.forEach(dept => {
        const card = document.createElement('div');
        card.className = 'department-card';
        card.setAttribute('data-department', dept.name);
        card.addEventListener('click', () => filterByDepartment(dept.name));
        
        // Determine risk level for color indicator
        let riskClass = 'risk-low';
        let riskText = 'Low Risk';
        if (dept.burnoutPercentage >= 30) {
            riskClass = 'risk-high';
            riskText = 'High Risk';
        } else if (dept.burnoutPercentage >= 15) {
            riskClass = 'risk-medium';
            riskText = 'Moderate Risk';
        }
        
        card.innerHTML = `
            <div class="department-card-header">
                <h3 class="department-name">${dept.name}</h3>
                <span class="department-employee-count">${dept.totalEmployees} employees</span>
            </div>
            <div class="department-card-body">
                <div class="department-metric">
                    <span class="department-metric-label">Avg Productivity</span>
                    <span class="department-metric-value">${dept.avgProductivity.toFixed(1)}</span>
                </div>
                <div class="department-metric">
                    <span class="department-metric-label">High Burnout Risk</span>
                    <span class="department-metric-value department-burnout-value ${riskClass}">${dept.highBurnoutCount}</span>
                </div>
            </div>
            <div class="department-card-footer">
                <span class="department-risk-indicator ${riskClass}">${riskText}</span>
            </div>
        `;
        
        departmentGrid.appendChild(card);
    });
}

function filterByDepartment(departmentName) {
    // Check if already filtered by this department
    const currentFilter = document.getElementById('departmentFilter').value;
    if (currentFilter === departmentName) {
        // Clear department filter
        document.getElementById('departmentFilter').value = '';
        applyFilters();
        return;
    }
    
    // Apply department filter
    document.getElementById('departmentFilter').value = departmentName;
    applyFilters();
    
    // Scroll to table
    setTimeout(() => {
        document.querySelector('.table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function updateAIInsights(employees) {
    if (!employees || employees.length === 0) {
        document.getElementById('insightsGrid').innerHTML = '<div class="insights-empty">No data available for insights</div>';
        return;
    }
    
    const insights = [];
    
    // Insight 1: Meeting frequency and stress correlation
    const highMeetingEmployees = employees.filter(e => e.Meetings_Per_Week >= 10);
    const highMeetingStress = highMeetingEmployees.length > 0 
        ? highMeetingEmployees.reduce((sum, e) => sum + e.Stress_Level, 0) / highMeetingEmployees.length 
        : 0;
    const lowMeetingEmployees = employees.filter(e => e.Meetings_Per_Week < 5);
    const lowMeetingStress = lowMeetingEmployees.length > 0
        ? lowMeetingEmployees.reduce((sum, e) => sum + e.Stress_Level, 0) / lowMeetingEmployees.length
        : 0;
    
    if (highMeetingEmployees.length > 0 && highMeetingStress > lowMeetingStress + 1) {
        insights.push({
            icon: '📅',
            title: 'Meeting Frequency Impact',
            text: `High meeting frequency (10+ meetings/week) correlates with ${(highMeetingStress - lowMeetingStress).toFixed(1)} points higher average stress levels compared to low-meeting employees.`,
            type: 'correlation',
            severity: highMeetingStress >= 7 ? 'high' : 'medium'
        });
    }
    
    // Insight 2: Work-life balance and burnout risk
    const lowBalanceEmployees = employees.filter(e => e.Work_Life_Balance < 5);
    const lowBalanceBurnoutRate = lowBalanceEmployees.length > 0
        ? (lowBalanceEmployees.filter(e => e.Burnout_Risk === 'High').length / lowBalanceEmployees.length) * 100
        : 0;
    const highBalanceEmployees = employees.filter(e => e.Work_Life_Balance >= 7);
    const highBalanceBurnoutRate = highBalanceEmployees.length > 0
        ? (highBalanceEmployees.filter(e => e.Burnout_Risk === 'High').length / highBalanceEmployees.length) * 100
        : 0;
    
    if (lowBalanceEmployees.length > 0 && lowBalanceBurnoutRate > highBalanceBurnoutRate + 10) {
        insights.push({
            icon: '⚖️',
            title: 'Work-Life Balance Risk',
            text: `Employees with low work-life balance (<5) show ${lowBalanceBurnoutRate.toFixed(1)}% high burnout risk, compared to ${highBalanceBurnoutRate.toFixed(1)}% for those with good balance (≥7).`,
            type: 'risk',
            severity: lowBalanceBurnoutRate >= 30 ? 'high' : 'medium'
        });
    }
    
    // Insight 3: WFH days and productivity
    const wfhEmployees = employees.filter(e => e.WFH_Days_Per_Week >= 3);
    const wfhProductivity = wfhEmployees.length > 0
        ? wfhEmployees.reduce((sum, e) => sum + e.Productivity_Score, 0) / wfhEmployees.length
        : 0;
    const officeEmployees = employees.filter(e => e.WFH_Days_Per_Week <= 1);
    const officeProductivity = officeEmployees.length > 0
        ? officeEmployees.reduce((sum, e) => sum + e.Productivity_Score, 0) / officeEmployees.length
        : 0;
    
    if (wfhEmployees.length > 0 && wfhProductivity > officeProductivity + 3) {
        insights.push({
            icon: '🏠',
            title: 'WFH Productivity Benefit',
            text: `Employees with 3+ WFH days/week show ${(wfhProductivity - officeProductivity).toFixed(1)} points higher average productivity compared to primarily office-based workers.`,
            type: 'optimization',
            severity: 'low'
        });
    }
    
    // Insight 4: Stress level and productivity correlation
    const lowStressEmployees = employees.filter(e => e.Stress_Level <= 3);
    const lowStressProductivity = lowStressEmployees.length > 0
        ? lowStressEmployees.reduce((sum, e) => sum + e.Productivity_Score, 0) / lowStressEmployees.length
        : 0;
    const highStressEmployees = employees.filter(e => e.Stress_Level >= 7);
    const highStressProductivity = highStressEmployees.length > 0
        ? highStressEmployees.reduce((sum, e) => sum + e.Productivity_Score, 0) / highStressEmployees.length
        : 0;
    
    if (lowStressEmployees.length > 0 && highStressEmployees.length > 0 && lowStressProductivity > highStressProductivity + 5) {
        insights.push({
            icon: '📉',
            title: 'Stress-Productivity Link',
            text: `Low-stress employees (≤3) average ${(lowStressProductivity - highStressProductivity).toFixed(1)} points higher productivity than high-stress employees (≥7), indicating stress management is critical.`,
            type: 'correlation',
            severity: 'high'
        });
    }
    
    // Insight 5: Department performance variance
    const departments = [...new Set(employees.map(e => e.Department))];
    if (departments.length >= 2) {
        const deptProductivity = departments.map(dept => {
            const deptEmps = employees.filter(e => e.Department === dept);
            return {
                name: dept,
                avg: deptEmps.reduce((sum, e) => sum + e.Productivity_Score, 0) / deptEmps.length
            };
        });
        deptProductivity.sort((a, b) => b.avg - a.avg);
        const variance = deptProductivity[0].avg - deptProductivity[deptProductivity.length - 1].avg;
        
        if (variance >= 10) {
            insights.push({
                icon: '🏢',
                title: 'Department Performance Gap',
                text: `${deptProductivity[0].name} leads with ${deptProductivity[0].avg.toFixed(1)} avg productivity, while ${deptProductivity[deptProductivity.length - 1].name} trails at ${deptProductivity[deptProductivity.length - 1].avg.toFixed(1)}. Consider knowledge sharing initiatives.`,
                type: 'performance',
                severity: 'medium'
            });
        }
    }
    
    // Insight 6: Optimal work hours
    const optimalHours = employees.filter(e => e.Work_Hours_Per_Week >= 35 && e.Work_Hours_Per_Week <= 42);
    const optimalProductivity = optimalHours.length > 0
        ? optimalHours.reduce((sum, e) => sum + e.Productivity_Score, 0) / optimalHours.length
        : 0;
    const excessiveHours = employees.filter(e => e.Work_Hours_Per_Week > 45);
    const excessiveProductivity = excessiveHours.length > 0
        ? excessiveHours.reduce((sum, e) => sum + e.Productivity_Score, 0) / excessiveHours.length
        : 0;
    
    if (optimalHours.length > 0 && excessiveHours.length > 0 && optimalProductivity > excessiveProductivity + 2) {
        insights.push({
            icon: '⏰',
            title: 'Optimal Work Hours',
            text: `Employees working 35-42 hours/week show better productivity than those working 45+ hours, suggesting diminishing returns on extended work time.`,
            type: 'optimization',
            severity: 'medium'
        });
    }
    
    // Display insights (limit to 6)
    const insightsToShow = insights.slice(0, 6);
    const insightsGrid = document.getElementById('insightsGrid');
    insightsGrid.innerHTML = '';
    
    if (insightsToShow.length === 0) {
        insightsGrid.innerHTML = '<div class="insights-empty">Insufficient data for insights generation</div>';
        return;
    }
    
    insightsToShow.forEach(insight => {
        const insightCard = document.createElement('div');
        insightCard.className = `insight-card insight-${insight.severity}`;
        
        insightCard.innerHTML = `
            <div class="insight-icon">${insight.icon}</div>
            <div class="insight-content">
                <h4 class="insight-title">${insight.title}</h4>
                <p class="insight-text">${insight.text}</p>
            </div>
            <div class="insight-type-badge">${insight.type}</div>
        `;
        
        insightsGrid.appendChild(insightCard);
    });
}

function showError(message) {
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    // Always hide loading message when showing error
    if (loadingMessage) loadingMessage.style.display = 'none';
    if (errorMessage) {
        errorMessage.innerHTML = message;
        errorMessage.style.display = 'block';
    } else {
        console.error('Error:', message);
        alert('Error: ' + message);
    }
}
