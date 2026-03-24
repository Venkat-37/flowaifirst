import React from "react"
import { Navigate } from "react-router-dom"
import useAuthStore from "../store/authStore"

export default function ProtectedRoute({ children, requiredRole, roles }) {
  const { token, user } = useAuthStore()

  if (!token) return <Navigate to="/login" replace />

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  if (roles && !roles.includes(user?.role)) {
    return <Navigate to={user?.role === 'Employee' ? '/employee' : '/dashboard'} replace />
  }

  return children
}
