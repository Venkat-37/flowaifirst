import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import { signInWithGoogle, signOutUser } from '../config/firebase'

const API = import.meta.env.VITE_API_URL || ''

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      error: null,

      login: async () => {
        set({ loading: true, error: null })
        try {
          const { idToken } = await signInWithGoogle()
          const res = await axios.post(`${API}/api/auth/google`, { id_token: idToken })
          set({
            token: res.data.access_token,
            user: res.data.user,
          })
          return res.data.user
        } catch (err) {
          // Handles Firebase errors like auth/popup-closed-by-user
          const msg = err?.response?.data?.detail || err?.message || 'Login failed'
          set({ error: msg })
          throw new Error(msg)
        } finally {
          // Always clear loading, even if popup is closed or request fails
          set({ loading: false })
        }
      },

      demoEmployeeLogin: async (empId) => {
        set({ loading: true, error: null })
        try {
          const res = await axios.post(`${API}/api/auth/demo-login`, { emp_id: empId })
          set({
            token: res.data.access_token,
            user: res.data.user,
          })
          return res.data.user
        } catch (err) {
          const msg = err?.response?.data?.detail || err?.message || 'Employee login failed'
          set({ error: msg })
          throw new Error(msg)
        } finally {
          set({ loading: false })
        }
      },

      logout: async () => {
        await signOutUser()
        set({ user: null, token: null, error: null })
      },

      clearError: () => set({ error: null }),

      isHRManager: () => get().user?.role === 'HR Manager',
      isDeptHead: () => get().user?.role === 'Department Head',
      isEmployee: () => get().user?.role === 'Employee',
    }),
    {
      name: 'flowai-auth',
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
)

// Axios interceptor — attach JWT to every request
axios.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(err)
  }
)