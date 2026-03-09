import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login            from './pages/Login'
import HRDashboard      from './pages/HRDashboard'
import Explorer         from './pages/Explorer'
import TwinMirror       from './pages/TwinMirror'
import EmployeeDashboard from './pages/EmployeeDashboard'
import WellnessStudio   from './pages/WellnessStudio'
import { useAuthStore } from './store/authStore'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function RootRedirect() {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'Employee' ? '/employee' : '/dashboard'} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />

          <Route path="/dashboard" element={
            <ProtectedRoute roles={['HR Manager', 'Department Head']}>
              <Layout><HRDashboard /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/explorer" element={
            <ProtectedRoute roles={['HR Manager', 'Department Head']}>
              <Layout><Explorer /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/twin" element={
            <ProtectedRoute>
              <Layout><TwinMirror /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/employee" element={
            <ProtectedRoute roles={['Employee']}>
              <Layout><EmployeeDashboard /></Layout>
            </ProtectedRoute>
          } />

          {/* Wellness Studio — accessible to all authenticated roles */}
          <Route path="/wellness" element={
            <ProtectedRoute>
              <Layout><WellnessStudio /></Layout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
