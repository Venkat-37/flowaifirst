// ============================================
// SHARED NAVIGATION COMPONENT
// ============================================

function initNavigation() {
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
    
    const navHTML = `
        <nav class="top-nav">
            <div class="nav-content">
                <div class="nav-logo">
                    <div class="logo-icon">🤖</div>
                    <span class="logo-text">Digital Twin</span>
                </div>
                <nav class="main-nav">
                    <a href="dashboard.html" class="nav-link ${currentPage === 'dashboard.html' ? 'active' : ''}">
                        <span class="nav-icon">📊</span>
                        <span class="nav-text">Dashboard</span>
                    </a>
                    <a href="ai-insights.html" class="nav-link ${currentPage === 'ai-insights.html' ? 'active' : ''}">
                        <span class="nav-icon">🤖</span>
                        <span class="nav-text">AI Insights</span>
                    </a>
                    <a href="department-analytics.html" class="nav-link ${currentPage === 'department-analytics.html' ? 'active' : ''}">
                        <span class="nav-icon">🏢</span>
                        <span class="nav-text">Departments</span>
                    </a>
                    <a href="employee-explorer.html" class="nav-link ${currentPage === 'employee-explorer.html' ? 'active' : ''}">
                        <span class="nav-icon">👥</span>
                        <span class="nav-text">Employees</span>
                    </a>
                </nav>
                <div class="nav-user">
                    <div class="user-avatar">HR</div>
                    <div class="user-info">
                        <div class="user-name">HR Manager</div>
                        <div class="user-role">Human Resources</div>
                    </div>
                    <button onclick="window.location.href='login.html'" class="nav-logout-btn" title="Logout">
                        <span>🚪</span>
                    </button>
                </div>
            </div>
        </nav>
    `;
    
    // Insert navigation at the beginning of body
    document.body.insertAdjacentHTML('afterbegin', navHTML);
}

// Initialize navigation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
} else {
    initNavigation();
}
