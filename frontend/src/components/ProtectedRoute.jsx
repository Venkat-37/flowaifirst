import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute({ children, roles }) {
  const { user, token } = useAuthStore()
  if (!user || !token) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'Employee' ? '/employee' : '/dashboard'} replace />
  }
  return children
}
