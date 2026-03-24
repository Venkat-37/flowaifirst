// src/hooks/useApi.js
//
// Unified API layer — merges React Query hooks (v1) with
// fetch-based auth-token request engine (v2).
//
// All hooks now automatically attach the JWT from authStore.
// Default export (useApi) returns { get, post, patch, delete }
// for legacy consumers (e.g. AdminPanel) and direct callers.
//
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import useAuthStore from '../store/authStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || ''

// ── Core fetch engine (replaces axios — no extra dependency) ─────────────────
// All React Query hooks share this same engine so every request
// automatically carries the current auth token from the store.
async function request(method, url, token, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const config = { method, headers }
  if (body !== undefined) config.body = JSON.stringify(body)

  const response = await fetch(`${API_BASE}${url}`, config)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `HTTP Error ${response.status}`)
  }
  return data
}

// ── Singleton api object (used directly by hooks + legacy consumers) ─────────
// Calling api.get/post etc. outside a hook context won't have the token —
// prefer the useApi() hook for components that need auth.
export const api = {
  get:    (url, params) => {
    const qs = params && Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : ''
    return request('GET', `${url}${qs}`, null)
  },
  post:   (url, body)   => request('POST',   url, null, body),
  patch:  (url, body)   => request('PATCH',  url, null, body),
  delete: (url)         => request('DELETE', url, null),
}

// ── useApi — authenticated hook for direct callers / AdminPanel ──────────────
export default function useApi() {
  const { token } = useAuthStore()
  return {
    get:    (url, params) => {
      const qs = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString()
        : ''
      return request('GET', `${url}${qs}`, token)
    },
    post:   (url, body) => request('POST',   url, token, body),
    patch:  (url, body) => request('PATCH',  url, token, body),
    delete: (url)       => request('DELETE', url, token),
  }
}

// ── Internal: authenticated fetcher for React Query hooks ───────────────────
// Reads token fresh from store on every query execution.
function useAuthFetcher() {
  const { token } = useAuthStore()
  return {
    get:  (url, params) => {
      const qs = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString()
        : ''
      return request('GET', `${url}${qs}`, token)
    },
    post: (url, body) => request('POST', url, token, body),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT QUERY HOOKS
// All hooks use useAuthFetcher() so every call carries the JWT automatically.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Employees ────────────────────────────────────────────────────────────────
export function useEmployees(filters = {}) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['employees', filters],
    queryFn:  () => get('/api/employees', filters),
    staleTime: 30_000,
  })
}

export function useEmployeeSummary() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['employees', 'summary'],
    queryFn:  () => get('/api/employees/summary'),
    staleTime: 60_000,
  })
}

export function useEmployeeStats(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['employee', empId, 'stats'],
    queryFn:  () => get(`/api/employees/${empId}/stats`),
    enabled:  !!empId,
    staleTime: 30_000,
  })
}

export function useEmployeeProfile(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['profile', empId],
    queryFn:  () => get(`/api/employees/${empId}/profile`),
    enabled:  !!empId,
    staleTime: 30_000,
  })
}

// ── Digital Twins ─────────────────────────────────────────────────────────────
export function useOrgSummary() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['twins', 'org-summary'],
    queryFn:  () => get('/api/twins/org-summary'),
    staleTime: 60_000,
  })
}

export function useTwin(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['twin', empId],
    queryFn:  () => get(`/api/twins/${empId}`),
    enabled:  !!empId,
    staleTime: 30_000,
  })
}

export function useRefreshTwin(empId) {
  const qc = useQueryClient()
  const { post } = useAuthFetcher()
  return useMutation({
    mutationFn: () => post(`/api/twins/${empId}/refresh`),
    onSuccess: () => {
      qc.invalidateQueries(['twin', empId])
      qc.invalidateQueries(['employee', empId])
    },
  })
}

export function useSyncTwin(empId) {
  const qc = useQueryClient()
  const { post } = useAuthFetcher()
  return useMutation({
    mutationFn: () => post(`/api/twins/${empId}/sync`),
    onSuccess: () => {
      qc.invalidateQueries(['twin', empId])
      qc.invalidateQueries(['employee', empId])
    },
  })
}

// ── Insights ──────────────────────────────────────────────────────────────────
export function useGenerateInsight() {
  const qc = useQueryClient()
  const { post } = useAuthFetcher()
  return useMutation({
    mutationFn: (data) => post('/api/insights/generate', data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['insight', vars.target_id])
    },
  })
}

export function useMbiCorrelation() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['mbi', 'correlation', 'org'],
    queryFn:  () => get('/api/mbi/correlation/org'),
    staleTime: 60_000,
  })
}

// ── Forecast ──────────────────────────────────────────────────────────────────
export function useBurnoutForecast(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['forecast', empId],
    queryFn:  () => get(`/api/forecast/${empId}`),
    enabled:  !!empId,
    staleTime: 60_000,
  })
}

export function useOrgRiskTrend() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['forecast', 'org-risk-trend'],
    queryFn:  () => get('/api/forecast/org/at-risk-trend'),
    staleTime: 120_000,
  })
}

// ── Organizational Intelligence ───────────────────────────────────────────────
export function useOrgHealth() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['analytics', 'org-health'],
    queryFn:  () => get('/api/analytics/organization/health'),
    staleTime: 60_000,
  })
}

export function useDepartmentIntelligence() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['analytics', 'departments'],
    queryFn:  () => get('/api/analytics/departments'),
    staleTime: 60_000,
  })
}

// ── ML Predictive Analytics ───────────────────────────────────────────────────
export function usePredictiveProfile(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['ml', 'predictive-profile', empId],
    queryFn:  () => get(`/api/ml/${empId}/predictive-profile`),
    enabled:  !!empId,
    staleTime: 60_000,
  })
}

// ── Telemetry & Live Activity ─────────────────────────────────────────────────
export function useLiveActivity(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['live-activity', empId],
    queryFn:  () => get(`/api/telemetry/live-activity/${empId}`),
    enabled:  !!empId,
    staleTime: 3_000,
    refetchInterval: 5_000,
  })
}

export function useTrackingStatus(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['tracking-status', empId],
    queryFn:  () => get(`/api/telemetry/is-tracking-active/${empId}`),
    enabled:  !!empId,
    staleTime: 3_000,
    refetchInterval: 5_000,
  })
}

export function useToggleTracking(empId) {
  const qc = useQueryClient()
  const { post } = useAuthFetcher()
  return useMutation({
    mutationFn: (action) => post(`/api/telemetry/${action}-tracking/${empId}`),
    onSuccess: () => {
      qc.invalidateQueries(['tracking-status', empId])
    },
  })
}

// ── Wellness ──────────────────────────────────────────────────────────────────
export function useLogMood(empId) {
  const qc = useQueryClient()
  const { post } = useAuthFetcher()
  return useMutation({
    mutationFn: (score) => post('/api/telemetry/mood', { emp_id: empId, mood_score: score }),
    onSuccess: () => qc.invalidateQueries(['twin', empId]),
  })
}

// ── Actuation ─────────────────────────────────────────────────────────────────
export function useManualTrigger() {
  const { post } = useAuthFetcher()
  return useMutation({
    mutationFn: (data) => post('/api/actuation/trigger', data),
  })
}

export function useActuationHistory(empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['actuation', empId],
    queryFn:  () => get(`/api/actuation/history/${empId}`),
    enabled:  !!empId,
    staleTime: 30_000,
  })
}

// ── RLHF Feedback ─────────────────────────────────────────────────────────────
export function useRateSuggestion() {
  const { post } = useAuthFetcher()
  return useMutation({
    mutationFn: (data) => post('/api/feedback/rate', data),
  })
}

export function useMyRating(suggestionId, empId) {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['feedback', 'my-rating', suggestionId, empId],
    queryFn:  () => get(`/api/feedback/my-rating/${suggestionId}`, { emp_id: empId }),
    enabled:  !!suggestionId && !!empId,
    staleTime: 300_000,
  })
}

export function useRlhfSummary() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['feedback', 'rlhf-summary'],
    queryFn:  () => get('/api/feedback/rlhf-summary'),
    staleTime: 120_000,
  })
}

// ── Notifications ─────────────────────────────────────────────────────────────
export function useNotifications() {
  const { get } = useAuthFetcher()
  return useQuery({
    queryKey: ['notifications'],
    queryFn:  () => get('/api/notifications'),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  const { token } = useAuthStore()
  return useMutation({
    // PATCH is not on useAuthFetcher shorthand — call request directly
    mutationFn: (id) => request('PATCH', `/api/notifications/${id}/read`, token),
    onSuccess:  () => qc.invalidateQueries(['notifications']),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  const { token } = useAuthStore()
  return useMutation({
    mutationFn: () => request('PATCH', '/api/notifications/read-all', token),
    onSuccess:  () => qc.invalidateQueries(['notifications']),
  })
}