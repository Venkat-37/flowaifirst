import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

// ── Raw fetchers ─────────────────────────────────────────────────────────────
export const api = {
  get: (url, params) => axios.get(`${API}${url}`, { params }).then(r => r.data),
  post: (url, data) => axios.post(`${API}${url}`, data).then(r => r.data),
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
export function useEmployees(filters = {}) {
  return useQuery({
    queryKey: ['employees', filters],
    queryFn: () => api.get('/api/employees', filters),
    staleTime: 30_000,
  })
}

export function useEmployeeSummary() {
  return useQuery({
    queryKey: ['employees', 'summary'],
    queryFn: () => api.get('/api/employees/summary'),
    staleTime: 60_000,
  })
}

export function useEmployeeStats(empId) {
  return useQuery({
    queryKey: ['employee', empId, 'stats'],
    queryFn: () => api.get(`/api/employees/${empId}/stats`),
    enabled: !!empId,
    staleTime: 30_000,
  })
}

export function useOrgSummary() {
  return useQuery({
    queryKey: ['twins', 'org-summary'],
    queryFn: () => api.get('/api/twins/org-summary'),
    staleTime: 60_000,
  })
}

export function useTwin(empId) {
  return useQuery({
    queryKey: ['twin', empId],
    queryFn: () => api.get(`/api/twins/${empId}`),
    enabled: !!empId,
    staleTime: 30_000,
  })
}

export function useGenerateInsight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/api/insights/generate', data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['insight', vars.target_id])
    },
  })
}

export function useRefreshTwin(empId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/api/twins/${empId}/refresh`),
    onSuccess: () => {
      qc.invalidateQueries(['twin', empId])
      qc.invalidateQueries(['employee', empId])
    },
  })
}

// ── Forecast ──────────────────────────────────────────────────────────────────
export function useBurnoutForecast(empId) {
  return useQuery({
    queryKey: ['forecast', empId],
    queryFn: () => api.get(`/api/forecast/${empId}`),
    enabled: !!empId,
    staleTime: 60_000,
  })
}

export function useOrgRiskTrend() {
  return useQuery({
    queryKey: ['forecast', 'org-risk-trend'],
    queryFn: () => api.get('/api/forecast/org/at-risk-trend'),
    staleTime: 120_000,
  })
}

// ── Actuation ─────────────────────────────────────────────────────────────────
export function useManualTrigger() {
  return useMutation({
    mutationFn: (data) => api.post('/api/actuation/trigger', data),
  })
}

export function useActuationHistory(empId) {
  return useQuery({
    queryKey: ['actuation', empId],
    queryFn: () => api.get(`/api/actuation/history/${empId}`),
    enabled: !!empId,
    staleTime: 30_000,
  })
}

// ── RLHF Feedback ─────────────────────────────────────────────────────────────
export function useRateSuggestion() {
  return useMutation({
    mutationFn: (data) => api.post('/api/feedback/rate', data),
  })
}

export function useMyRating(suggestionId, empId) {
  return useQuery({
    queryKey: ['feedback', 'my-rating', suggestionId, empId],
    queryFn: () => api.get(`/api/feedback/my-rating/${suggestionId}`, { emp_id: empId }),
    enabled: !!suggestionId && !!empId,
    staleTime: 300_000,
  })
}

export function useRlhfSummary() {
  return useQuery({
    queryKey: ['feedback', 'rlhf-summary'],
    queryFn: () => api.get('/api/feedback/rlhf-summary'),
    staleTime: 120_000,
  })
}

// ── Notifications ─────────────────────────────────────────────────────────────
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/api/notifications'),
    staleTime: 15_000,
    refetchInterval: 15_000, // poll every 15s for new notifications
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => axios.patch(`${API}/api/notifications/${id}/read`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['notifications']),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => axios.patch(`${API}/api/notifications/read-all`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['notifications']),
  })
}
