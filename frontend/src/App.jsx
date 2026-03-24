// src/App.jsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

// Pages — original
import Login from './pages/Login'
import HRDashboard from './pages/HRDashboard'
import Explorer from './pages/Explorer'
import TwinMirror from './pages/TwinMirror'
import EmployeeDashboard from './pages/EmployeeDashboard'
import WellnessStudio from './pages/WellnessStudio'
import AdminPanel from './pages/AdminPanel'

// Pages — new admin flow
import AdminDashboard from './pages/AdminDashboard'

import useAuthStore from './store/authStore'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

// ── Root redirect ─────────────────────────────────────────────────────────────
// Handles both legacy role strings ('HR Manager', 'Employee')
// and new lowercase role strings ('hr_manager', 'employee', 'admin').
function RootRedirect() {
  const { user } = useAuthStore()

  if (!user) return <Navigate to="/login" replace />

  const role = user.role ?? ''

  // Admin / sys-admin → dedicated admin dashboard
  if (role === 'admin' || role === 'sys_admin') {
    return <Navigate to="/admin" replace />
  }

  // HR Manager (both casing conventions)
  if (role === 'hr_manager' || role === 'HR Manager' || role === 'Department Head') {
    return <Navigate to="/dashboard" replace />
  }

  // Employee (both casing conventions)
  return <Navigate to="/employee" replace />
}

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>

          {/* ── Public ─────────────────────────────────────────────────── */}
          <Route path="/login" element={<Login />} />
          <Route path="/"      element={<RootRedirect />} />

          {/* ── Admin — dedicated full-screen dashboard (no Layout shell) ─ */}
          {/* Accessible to 'admin' and 'sys_admin' roles only.             */}
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin', 'sys_admin', 'hr_manager', 'HR Manager']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          {/* ── HR / Department Head routes ─────────────────────────────── */}
          <Route path="/dashboard" element={
            <ProtectedRoute roles={['hr_manager', 'HR Manager', 'Department Head']}>
              <Layout><HRDashboard /></Layout>
            </ProtectedRoute>
          } />

          {/* Legacy /hr-dashboard alias — keeps the v2 path working too */}
          <Route path="/hr-dashboard" element={
            <ProtectedRoute roles={['hr_manager', 'HR Manager', 'Department Head']}>
              <Layout><HRDashboard /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/explorer" element={
            <ProtectedRoute roles={['hr_manager', 'HR Manager', 'Department Head']}>
              <Layout><Explorer /></Layout>
            </ProtectedRoute>
          } />

          {/* AdminPanel — HR-facing user management panel inside the app   */}
          <Route path="/admin-panel" element={
            <ProtectedRoute roles={['hr_manager', 'HR Manager']}>
              <Layout><AdminPanel /></Layout>
            </ProtectedRoute>
          } />

          {/* ── Twin mirror — all authenticated roles ───────────────────── */}
          <Route path="/twin" element={
            <ProtectedRoute>
              <Layout><TwinMirror /></Layout>
            </ProtectedRoute>
          } />

          {/* ── Employee routes ─────────────────────────────────────────── */}
          <Route path="/employee" element={
            <ProtectedRoute roles={['employee', 'Employee']}>
              <Layout><EmployeeDashboard /></Layout>
            </ProtectedRoute>
          } />

          {/* ── Wellness Studio — all authenticated roles ───────────────── */}
          <Route path="/wellness" element={
            <ProtectedRoute>
              <Layout><WellnessStudio /></Layout>
            </ProtectedRoute>
          } />

          {/* ── Catch-all ───────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}