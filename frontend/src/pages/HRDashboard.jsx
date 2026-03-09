/**
 * HRDashboard — Redesigned with Cognitive Load Theory (CLT) principles:
 *
 * 1. PROGRESSIVE DISCLOSURE  — "What needs my attention?" → "Why?" → "Deep-dive"
 *    The page has three deliberate tiers: Command Brief (1 sentence) → Action Queue
 *    (critical people) → Analytics (charts). HR managers never have to scroll to
 *    find the most urgent signal.
 *
 * 2. PRE-ATTENTIVE PROCESSING — Color, size, and position encode meaning before
 *    conscious reading. Critical = red glow pulse. Stable = muted green. Every
 *    status is readable in <200ms without parsing numbers.
 *
 * 3. CHUNKING — Four metrics max per "card" (Miller's Law: 4±1 for expert users).
 *    Charts are contextual (one insight per chart, labeled directly on the bars).
 *
 * 4. EXTRANEOUS LOAD REDUCTION — Radar chart removed (high extraneous load, low
 *    information density). Replaced with a trend sparkline and a status column
 *    that replaces two separate data points with one encoded signal.
 *
 * 5. GERMANE LOAD SUPPORT — The Command Brief at the top creates a mental schema
 *    ("3 critical, improving week-over-week") before the user processes details,
 *    making subsequent data assimilation faster (schema activation).
 */
import { useState, useEffect } from 'react'
import { useOrgSummary, useEmployeeSummary, useOrgRiskTrend, useRlhfSummary } from '../hooks/useApi'
import RiskBadge from '../components/RiskBadge'
import AIInsightPanel from '../components/AIInsightPanel'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LabelList
} from 'recharts'
import {
  Users, AlertTriangle, TrendingUp, TrendingDown,
  Zap, ArrowRight, Minus, Activity, ChevronRight,
  CheckCircle, AlertCircle, XCircle, Heart, ThumbsUp, ThumbsDown, Bell
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function riskToColor(level) {
  return level === 'CRITICAL' ? '#dc2626'
    : level === 'HIGH' ? '#f97316'
      : level === 'MEDIUM' ? '#f59e0b'
        : '#10b981'
}

function burnoutBar(score) {
  const color = score >= 75 ? '#dc2626' : score >= 55 ? '#f97316' : score >= 35 ? '#f59e0b' : '#10b981'
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-ops-border/30 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="font-mono text-xs shrink-0" style={{ color }}>{score?.toFixed(0)}</span>
    </div>
  )
}

// ── Command Brief (Tier 1) ─────────────────────────────────────────────────────
function CommandBrief({ org, summ, trend }) {
  if (!org || !summ) return null

  const critical = summ.critical ?? 0
  const atRisk = summ.at_risk ?? 0
  const avgBurn = summ.avg_burnout ?? 0
  const trending = trend?.at_risk_trend?.filter(e => e.early_warning)?.length ?? 0

  const urgency = critical > 0 ? 'critical' : atRisk > 5 ? 'elevated' : 'nominal'
  const icon = urgency === 'critical' ? XCircle
    : urgency === 'elevated' ? AlertCircle
      : CheckCircle
  const Icon = icon
  const color = urgency === 'critical' ? 'text-ops-red border-ops-red/40 bg-ops-red/8'
    : urgency === 'elevated' ? 'text-ops-amber border-ops-amber/40 bg-ops-amber/8'
      : 'text-ops-green border-ops-green/30 bg-ops-green/5'
  const pulse = urgency === 'critical' ? 'animate-pulse' : ''

  const brief = critical > 0
    ? `${critical} employee${critical > 1 ? 's' : ''} at CRITICAL burnout — immediate action required.`
    : atRisk > 0
      ? `${atRisk} at-risk employees detected. ${trending > 0 ? `${trending} on deteriorating trajectories.` : 'Monitoring recommended.'}`
      : `Workforce stable. Avg burnout ${avgBurn?.toFixed(0)}/100 across ${summ.total_employees ?? 0} personnel.`

  return (
    <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${color}`}>
      <Icon size={16} className={`mt-0.5 shrink-0 ${pulse}`} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-body leading-snug">{brief}</span>
        {trending > 0 && urgency !== 'critical' && (
          <span className="ml-2 font-mono text-xs opacity-70">
            · {trending} forecast to escalate in 21d
          </span>
        )}
      </div>
      <span className="font-mono text-xs opacity-50 shrink-0 mt-0.5 uppercase tracking-wider">
        {urgency}
      </span>
    </div>
  )
}

// ── KPI strip (Tier 1 cont.) ───────────────────────────────────────────────────
function KpiStrip({ summ, orgLoading }) {
  const kpis = [
    {
      label: 'Personnel',
      value: summ?.total_employees ?? '—',
      sub: 'active twins',
      color: 'text-ops-cyan',
      Icon: Users,
    },
    {
      label: 'Avg Efficiency',
      value: summ?.avg_efficiency != null ? summ.avg_efficiency.toFixed(1) + '%' : '—',
      sub: 'productive ratio',
      color: summ?.avg_efficiency >= 60 ? 'text-ops-green' : 'text-ops-amber',
      Icon: Activity,
    },
    {
      label: 'At Risk',
      value: summ?.at_risk ?? '—',
      sub: `${summ?.critical ?? 0} critical`,
      color: (summ?.critical ?? 0) > 0 ? 'text-ops-red' : (summ?.at_risk ?? 0) > 0 ? 'text-ops-amber' : 'text-ops-green',
      Icon: AlertTriangle,
    },
    {
      label: 'Avg Burnout',
      value: summ?.avg_burnout != null ? summ.avg_burnout.toFixed(0) : '—',
      sub: 'lower is better',
      color: (summ?.avg_burnout ?? 0) > 50 ? 'text-ops-red' : (summ?.avg_burnout ?? 0) > 35 ? 'text-ops-amber' : 'text-ops-green',
      Icon: Zap,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map(({ label, value, sub, color, Icon }) => (
        <div key={label} className="ops-card p-4">
          <div className="flex items-start justify-between mb-2">
            <Icon size={14} className={`${color} opacity-70 mt-0.5`} />
          </div>
          {orgLoading ? (
            <div className="h-7 w-16 bg-ops-border/30 rounded animate-pulse mb-1" />
          ) : (
            <p className={`font-mono text-2xl font-bold leading-none ${color}`}>{value}</p>
          )}
          <p className="font-mono text-xs text-ops-muted tracking-widest mt-1.5 uppercase">{label}</p>
          <p className="text-xs text-ops-muted/60 mt-0.5 font-body">{sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Action Queue (Tier 2) — the most important table ──────────────────────────
function ActionQueue({ org, orgLoading, navigate }) {
  const atRisk = org?.top_at_risk ?? []

  return (
    <div className="ops-card">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-ops-border/50 flex items-center gap-2">
        <AlertTriangle size={13} className="text-ops-amber" />
        <span className="text-xs font-mono tracking-widest text-ops-muted">ACTION QUEUE</span>
        <span className="ml-auto font-mono text-xs text-ops-muted">
          {atRisk.length} flagged
        </span>
        <span className="font-mono text-xs text-ops-muted/50 hidden md:inline">
          · sorted by burnout severity
        </span>
      </div>

      {orgLoading ? (
        <div className="divide-y divide-ops-border/20">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-4">
              <div className="h-3 w-20 bg-ops-border/20 rounded animate-pulse" />
              <div className="h-3 w-32 bg-ops-border/20 rounded animate-pulse flex-1" />
              <div className="h-3 w-16 bg-ops-border/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : atRisk.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <CheckCircle size={24} className="text-ops-green mx-auto mb-2 opacity-60" />
          <p className="font-mono text-xs text-ops-green">NO AT-RISK PERSONNEL DETECTED</p>
        </div>
      ) : (
        <div className="divide-y divide-ops-border/15">
          {atRisk.map((emp) => {
            const rc = riskToColor(emp.risk_level)
            const isCritical = emp.risk_level === 'CRITICAL'
            return (
              <div
                key={emp.emp_id}
                onClick={() => navigate(`/twin?id=${emp.emp_id}`)}
                className={`px-5 py-3 flex items-center gap-4 cursor-pointer transition-colors
                  hover:bg-white/3 group ${isCritical ? 'bg-ops-red/5' : ''}`}
              >
                {/* Status dot */}
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${isCritical ? 'animate-pulse' : ''}`}
                  style={{ background: rc, boxShadow: `0 0 8px ${rc}60` }}
                />

                {/* Employee ID */}
                <span className="font-mono text-xs text-ops-cyan w-16 shrink-0">{emp.emp_id}</span>

                {/* Dept */}
                <span className="font-mono text-xs text-ops-muted w-24 shrink-0 hidden sm:inline truncate">
                  {emp.department}
                </span>

                {/* Burnout bar — encodes both number and severity in one visual */}
                <div className="flex-1 min-w-[80px] max-w-[140px]">
                  {burnoutBar(emp.burnout_score)}
                </div>

                {/* Efficiency */}
                <span className="font-mono text-xs text-ops-muted/70 w-12 text-right hidden lg:inline">
                  {emp.efficiency?.toFixed(0)}%
                </span>

                {/* Risk badge */}
                <RiskBadge level={emp.risk_level} />

                {/* Action arrow */}
                <ChevronRight
                  size={13}
                  className="text-ops-muted/30 group-hover:text-ops-cyan transition-colors ml-auto shrink-0"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Analytics (Tier 3) — supporting, not primary ─────────────────────────────
function DeptChart({ deptData, loading }) {
  if (loading) return (
    <div className="h-52 flex items-center justify-center font-mono text-xs text-ops-muted animate-pulse">
      COMPUTING…
    </div>
  )

  // Single, focused chart: efficiency per department (one insight per chart = CLT)
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={deptData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}
        barCategoryGap="28%">
        <XAxis
          dataKey="dept"
          tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'Share Tech Mono' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'Share Tech Mono' }}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,180,216,0.05)' }}
          contentStyle={{
            background: '#0d1b2e', border: '1px solid #1e4068',
            borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 11
          }}
        />
        <Bar dataKey="efficiency" name="Efficiency %" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {deptData.map((d) => (
            <Cell
              key={d.dept}
              fill={d.at_risk > 2 ? '#f97316' : d.efficiency >= 65 ? '#10b981' : '#00b4d8'}
              style={{ filter: `drop-shadow(0 0 5px ${d.at_risk > 2 ? '#f9731640' : '#00b4d840'})` }}
            />
          ))}
          <LabelList
            dataKey="efficiency"
            position="top"
            formatter={(v) => v?.toFixed(0) + '%'}
            style={{ fill: '#64748b', fontSize: 9, fontFamily: 'Share Tech Mono' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Risk trajectory mini-table (replaces radar) ────────────────────────────────
function TrajectoryTable({ trend, loading }) {
  const items = trend?.at_risk_trend?.slice(0, 5) ?? []

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp size={12} className="text-ops-amber" />
        <span className="text-xs font-mono tracking-widest text-ops-muted">DETERIORATING TRAJECTORIES</span>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 bg-ops-border/20 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 text-xs font-mono text-ops-green/70 py-3">
          <CheckCircle size={12} />
          No deteriorating trajectories detected
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => {
            const vel = e.velocity
            const dir = vel > 0 ? <TrendingUp size={11} className="text-ops-red" />
              : vel < 0 ? <TrendingDown size={11} className="text-ops-green" />
                : <Minus size={11} className="text-ops-muted" />
            return (
              <div key={e.emp_id}
                className="flex items-center gap-2 bg-ops-black/30 rounded-lg px-3 py-2">
                {dir}
                <span className="font-mono text-xs text-ops-cyan w-16 shrink-0">{e.emp_id}</span>
                <span className="font-mono text-xs text-ops-muted truncate flex-1">{e.department}</span>
                <span className="font-mono text-xs shrink-0"
                  style={{ color: riskToColor(e.risk_trajectory) }}>
                  {e.forecast_21d?.toFixed(0)} @ 21d
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function HRDashboard() {
  const navigate = useNavigate()
  const { data: org, isLoading: orgLoading } = useOrgSummary()
  const { data: summ, isLoading: summLoading } = useEmployeeSummary()
  const { data: trend, isLoading: trendLoading } = useOrgRiskTrend()
  const { data: rlhf } = useRlhfSummary()

  // Recent actuations org-wide
  const [recentActuations, setRecentActuations] = useState([])
  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    axios.get(`${API}/api/actuation/history`).then(r => setRecentActuations(r.data.actuations?.slice(0, 5) || [])).catch(() => { })
  }, [])

  const deptData = org?.dept_breakdown?.map(d => ({
    dept: d.department.length > 8 ? d.department.slice(0, 8) : d.department,
    fullName: d.department,
    efficiency: d.avg_efficiency,
    burnout: d.avg_burnout,
    battery: d.avg_battery,
    at_risk: d.at_risk,
  })) || []

  const loading = orgLoading || summLoading

  return (
    <div className="space-y-5 animate-slide-up">

      {/* ─── Page header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display text-xl font-bold text-ops-cyan tracking-widest"
            style={{ textShadow: '0 0 16px rgba(0,180,216,0.4)' }}>
            COMMAND CENTER
          </h1>
          <p className="text-xs font-mono text-ops-muted mt-0.5">
            WORKFORCE INTELLIGENCE · COGNITIVE-LOAD-OPTIMISED VIEW
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <div className="w-2 h-2 rounded-full bg-ops-green animate-pulse" />
            <span className="text-ops-green">LIVE</span>
            <span className="text-ops-muted ml-1">{org?.total_twins ?? '—'} TWINS</span>
          </div>
          <button
            onClick={() => navigate('/wellness')}
            className="ops-btn flex items-center gap-1.5 text-xs bg-ops-green/10 border-ops-green/30 text-ops-green hover:bg-ops-green/20"
          >
            <Heart size={12} /> WELLNESS
          </button>
        </div>
      </div>

      {/* ─── TIER 1: Command Brief (schema activation) ─── */}
      <CommandBrief org={org} summ={summ} trend={trend} />

      {/* ─── TIER 1: KPI Strip ─── */}
      <KpiStrip summ={summ} orgLoading={loading} />

      {/* ─── TIER 2: Action Queue (primary decision surface) ─── */}
      <ActionQueue org={org} orgLoading={orgLoading} navigate={navigate} />

      {/* ─── TIER 3: Analytics (supporting context only) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left: single focused bar chart */}
        <div className="ops-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-ops-cyan" />
              <span className="text-xs font-mono tracking-widest text-ops-muted">
                DEPARTMENT EFFICIENCY
              </span>
            </div>
            <span className="text-xs font-mono text-ops-muted/50">
              orange = dept with ≥3 at-risk
            </span>
          </div>
          <DeptChart deptData={deptData} loading={orgLoading} />
        </div>

        {/* Right: trajectory table (replaces uninformative radar) */}
        <div className="ops-card p-5 lg:col-span-2">
          <TrajectoryTable trend={trend} loading={trendLoading} />

          {/* Dept burnout summary — chunked inline list */}
          {deptData.length > 0 && (
            <div className="mt-5 pt-4 border-t border-ops-border/30">
              <div className="flex items-center gap-1.5 mb-3">
                <Zap size={12} className="text-ops-purple" />
                <span className="text-xs font-mono tracking-widest text-ops-muted">AVG BURNOUT BY DEPT</span>
              </div>
              <div className="space-y-1.5">
                {deptData.slice(0, 5).map(d => (
                  <div key={d.dept} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ops-muted w-20 truncate">{d.fullName}</span>
                    {burnoutBar(d.burnout)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── RLHF + Actuation Summary ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* RLHF Summary */}
        <div className="ops-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ThumbsUp size={13} className="text-ops-green" />
            <span className="text-xs font-mono tracking-widest text-ops-muted">AI CALIBRATION · RLHF</span>
          </div>
          {rlhf ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-ops-green/10 border border-ops-green/20 rounded-lg p-3 text-center">
                  <p className="font-mono text-lg font-bold text-ops-green">{rlhf.total_thumbs_up ?? 0}</p>
                  <p className="font-mono text-xs text-ops-muted mt-1">THUMBS UP</p>
                </div>
                <div className="bg-ops-red/10 border border-ops-red/20 rounded-lg p-3 text-center">
                  <p className="font-mono text-lg font-bold text-ops-red">{rlhf.total_thumbs_down ?? 0}</p>
                  <p className="font-mono text-xs text-ops-muted mt-1">THUMBS DOWN</p>
                </div>
                <div className="bg-ops-cyan/10 border border-ops-cyan/20 rounded-lg p-3 text-center">
                  <p className="font-mono text-lg font-bold text-ops-cyan">{rlhf.total_feedback ?? 0}</p>
                  <p className="font-mono text-xs text-ops-muted mt-1">TOTAL</p>
                </div>
              </div>
              {rlhf.top_preferred_types?.length > 0 && (
                <div>
                  <p className="font-mono text-xs text-ops-muted tracking-widest mb-2">PREFERRED SUGGESTION TYPES</p>
                  <div className="flex gap-2 flex-wrap">
                    {rlhf.top_preferred_types.map(t => (
                      <span key={t} className="font-mono text-xs bg-ops-green/10 text-ops-green border border-ops-green/30 px-2 py-1 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-ops-muted font-body">
                Employee feedback calibrates AI recommendations. More feedback = better suggestions.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ops-muted italic text-center py-4">
              No feedback collected yet. Employees can rate AI suggestions with 👍/👎.
            </p>
          )}
        </div>

        {/* Recent Actuations */}
        <div className="ops-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={13} className="text-ops-purple" />
            <span className="text-xs font-mono tracking-widest text-ops-muted">RECENT INTERVENTIONS</span>
          </div>
          {recentActuations.length === 0 ? (
            <p className="text-sm text-ops-muted italic text-center py-4 font-body">
              No actuation events yet. Use Twin Mirror → ACTUATE to trigger interventions.
            </p>
          ) : (
            <div className="divide-y divide-ops-border/20">
              {recentActuations.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <span className="text-sm">
                    {a.trigger === 'DO_NOT_DISTURB' ? '🔕' : a.trigger === 'WELLNESS_ALERT' ? '💚'
                      : a.trigger === 'CRITICAL_BURNOUT_ALERT' ? '🚨' : a.trigger === 'DEEP_WORK_MODE' ? '🧠' : '✅'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-ops-cyan">{a.emp_id}</p>
                    <p className="text-xs text-ops-muted truncate">{a.trigger?.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="font-mono text-xs text-ops-muted/60 shrink-0">
                    {a.timestamp ? new Date(a.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── AI Insight (collapsed by default to avoid overload) ─── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight size={11} className="text-ops-muted/50" />
          <span className="text-xs font-mono text-ops-muted/50 tracking-wider">
            OPTIONAL · AI analysis is one click away — does not load automatically
          </span>
        </div>
        <AIInsightPanel targetId="Frontend" targetType="department" />
      </div>

    </div>
  )
}
