import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTwin, useEmployeeStats, useRefreshTwin, useBurnoutForecast, useManualTrigger, useActuationHistory } from '../hooks/useApi'
import { useAuthStore } from '../store/authStore'
import BurnoutGauge from '../components/BurnoutGauge'
import RiskBadge from '../components/RiskBadge'
import AIInsightPanel from '../components/AIInsightPanel'
import StatCard from '../components/StatCard'
import FeedbackButton from '../components/FeedbackButton'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { Cpu, RefreshCw, Search, Activity, Clock, Layers, TrendingUp, Zap, Bell, Heart } from 'lucide-react'

const CAT_COLORS = {
  'Productive': '#10b981',
  'Productive (Contextual)': '#06b6d4',
  'Neutral': '#64748b',
  'Distraction': '#dc2626',
}

const RISK_COLOR = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#dc2626' }

function ForecastPanel({ empId }) {
  const { data: forecast, isLoading } = useBurnoutForecast(empId)
  const { mutate: trigger, isPending: triggering, data: triggerResult } = useManualTrigger()
  const { isHRManager } = useAuthStore()
  const [showTrigger, setShowTrigger] = useState(false)
  const [triggerType, setTriggerType] = useState('DO_NOT_DISTURB')

  if (!empId) return null

  const chartData = forecast ? [
    { label: 'Now', score: forecast.current_burnout },
    { label: '7d', score: forecast.forecast_7d },
    { label: '14d', score: forecast.forecast_14d },
    { label: '21d', score: forecast.forecast_21d },
  ] : []

  const dirColor = forecast?.trend_direction === 'IMPROVING' ? '#10b981'
    : forecast?.trend_direction === 'DETERIORATING' ? '#dc2626' : '#f59e0b'

  return (
    <div className="ops-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ops-border/50">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-ops-amber" style={{ filter: 'drop-shadow(0 0 5px #f59e0b)' }} />
          <span className="text-sm font-mono tracking-wider text-ops-text">BURNOUT FORECAST · 21-DAY</span>
          {forecast?.early_warning && (
            <span className="text-xs font-mono bg-ops-red/20 text-ops-red border border-ops-red/30 px-2 py-0.5 rounded animate-pulse">
              ⚠ EARLY WARNING
            </span>
          )}
        </div>
        {isHRManager() && (
          <button onClick={() => setShowTrigger(s => !s)}
            className="flex items-center gap-1.5 text-xs font-mono text-ops-cyan border border-ops-cyan/30
                       px-3 py-1.5 rounded hover:bg-ops-cyan/10 transition-colors">
            <Bell size={12} /> ACTUATE
          </button>
        )}
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="h-32 flex items-center justify-center font-mono text-xs text-ops-muted animate-pulse">
            COMPUTING TRAJECTORY…
          </div>
        ) : forecast ? (
          <div className="space-y-4">
            {/* Narrative */}
            <div className="bg-ops-navy/60 border border-ops-border/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs tracking-wider" style={{ color: dirColor }}>
                  {forecast.trend_direction}
                </span>
                <span className="font-mono text-xs text-ops-muted/60">
                  · {forecast.velocity > 0 ? '+' : ''}{forecast.velocity.toFixed(1)} pts/day
                  &nbsp;· confidence: {forecast.confidence}
                </span>
              </div>
              <p className="text-sm text-ops-text font-body leading-relaxed">{forecast.narrative}</p>
            </div>

            {/* Forecast chart */}
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={dirColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={dirColor} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                <Tooltip contentStyle={{
                  background: '#0d1b2e', border: '1px solid #1e4068',
                  borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 11
                }} />
                <Area type="monotone" dataKey="score" stroke={dirColor} strokeWidth={2}
                  fill="url(#fg)" dot={{ r: 4, fill: dirColor }} />
              </AreaChart>
            </ResponsiveContainer>

            {/* 3 forecast boxes */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '7-DAY', val: forecast.forecast_7d },
                { label: '14-DAY', val: forecast.forecast_14d },
                { label: '21-DAY', val: forecast.forecast_21d, trajectory: forecast.risk_trajectory },
              ].map(f => {
                const c = f.val >= 75 ? '#dc2626' : f.val >= 55 ? '#f97316' : f.val >= 35 ? '#f59e0b' : '#10b981'
                return (
                  <div key={f.label} className="bg-ops-black/50 border border-ops-border/30 rounded-lg p-3 text-center">
                    <p className="font-mono text-xs text-ops-muted mb-1">{f.label}</p>
                    <p className="font-mono text-xl font-bold" style={{ color: c }}>{f.val}</p>
                    {f.trajectory && (
                      <p className="font-mono text-xs mt-0.5" style={{ color: c }}>{f.trajectory}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ops-muted italic text-center py-4">No forecast data available.</p>
        )}

        {/* Actuation panel */}
        {showTrigger && isHRManager() && (
          <div className="mt-4 pt-4 border-t border-ops-border/30">
            <p className="font-mono text-xs text-ops-muted tracking-widest mb-3">FIRE ACTUATION TRIGGER</p>
            <div className="flex gap-2">
              <select value={triggerType} onChange={e => setTriggerType(e.target.value)}
                className="flex-1 ops-input font-mono text-xs">
                <option value="DO_NOT_DISTURB">Do Not Disturb</option>
                <option value="DEEP_WORK_MODE">Deep Work Mode</option>
                <option value="RESUME_NORMAL">Resume Normal</option>
                <option value="WELLNESS_ALERT">Wellness Alert</option>
                <option value="CRITICAL_BURNOUT_ALERT">Critical Alert</option>
              </select>
              <button onClick={() => trigger({ emp_id: empId, trigger: triggerType })} disabled={triggering}
                className="ops-btn flex items-center gap-1.5 text-xs">
                <Zap size={12} />
                {triggering ? 'Firing…' : 'Fire'}
              </button>
            </div>
            {triggerResult && (
              <div className="mt-2 bg-ops-green/10 border border-ops-green/30 rounded p-2">
                <p className="font-mono text-xs text-ops-green">
                  ✓ {triggerResult.payload?.trigger} fired for {triggerResult.payload?.emp_id}
                </p>
                <p className="font-mono text-xs text-ops-muted mt-1">
                  Actions: {triggerResult.payload?.actions?.join(' · ')}
                </p>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-ops-green/20">
                  <span className="font-mono text-xs text-ops-muted/60">Was this intervention appropriate?</span>
                  <FeedbackButton
                    suggestionType="actuation"
                    suggestionId={`act-${empId}-${triggerType}-${Date.now().toString(36)}`}
                    suggestionText={`${triggerType} triggered for ${empId}`}
                    context={{ emp_id: empId, trigger: triggerType }}
                    size="sm"
                    showCounts={false}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ActuationHistoryPanel({ empId }) {
  const { data, isLoading } = useActuationHistory(empId)
  if (!empId) return null
  const actuations = data?.actuations || []

  const TRIGGER_LABELS = {
    DO_NOT_DISTURB: { icon: '🔕', label: 'Do Not Disturb', color: '#f97316' },
    DEEP_WORK_MODE: { icon: '🧠', label: 'Deep Work Mode', color: '#06b6d4' },
    RESUME_NORMAL: { icon: '✅', label: 'Resume Normal', color: '#10b981' },
    WELLNESS_ALERT: { icon: '💚', label: 'Wellness Alert', color: '#f59e0b' },
    CRITICAL_BURNOUT_ALERT: { icon: '🚨', label: 'Critical Alert', color: '#dc2626' },
  }

  return (
    <div className="ops-card">
      <div className="px-5 py-4 border-b border-ops-border/50 flex items-center gap-2">
        <Bell size={15} className="text-ops-purple" style={{ filter: 'drop-shadow(0 0 5px #9333ea)' }} />
        <span className="text-sm font-mono tracking-wider text-ops-text">ACTUATION HISTORY</span>
        <span className="font-mono text-xs text-ops-muted ml-auto">{actuations.length} events</span>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="h-24 flex items-center justify-center font-mono text-xs text-ops-muted animate-pulse">
            LOADING ACTUATION LOG…
          </div>
        ) : actuations.length === 0 ? (
          <p className="text-sm text-ops-muted italic text-center py-4 font-body">
            No actuation events yet for this employee. Use the ACTUATE button above to fire triggers.
          </p>
        ) : (
          <div className="divide-y divide-ops-border/20 max-h-64 overflow-y-auto">
            {actuations.map((a, i) => {
              const info = TRIGGER_LABELS[a.trigger] || { icon: '⚡', label: a.trigger, color: '#64748b' }
              return (
                <div key={i} className="flex items-center gap-3 py-3">
                  <span className="text-lg">{info.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-semibold" style={{ color: info.color }}>
                      {info.label}
                    </p>
                    <p className="text-xs text-ops-muted truncate mt-0.5">
                      {a.actions?.join(' · ') || 'No actions'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xs text-ops-muted/60">
                      {a.timestamp ? new Date(a.timestamp).toLocaleString([], {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      }) : ''}
                    </p>
                    {a.context?.manual_override && (
                      <span className="font-mono text-xs text-ops-purple/60">Manual</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TwinMirror() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [empInput, setEmpInput] = useState(params.get('id') || user?.emp_id || '')
  const [queryId, setQueryId] = useState(params.get('id') || user?.emp_id || '')

  const { data: twin, isLoading: twinLoading } = useTwin(queryId)
  const { data: stats, isLoading: statsLoading } = useEmployeeStats(queryId)
  const { mutate: refresh, isPending: refreshing } = useRefreshTwin(queryId)

  const pieData = stats?.category_counts
    ? Object.entries(stats.category_counts).map(([name, value]) => ({ name, value }))
    : []

  const handleSearch = () => setQueryId(empInput.trim().toUpperCase())

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ops-cyan tracking-widest">TWIN MIRROR</h1>
          <p className="text-xs font-mono text-ops-muted mt-1">DIGITAL TWIN · COGNITIVE MODEL · PREDICTIVE FORECAST</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="ops-input w-36 font-mono uppercase"
            placeholder="EMP001"
            value={empInput}
            onChange={e => setEmpInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} className="ops-btn flex items-center gap-1.5">
            <Search size={13} /> QUERY
          </button>
          {queryId && (
            <button onClick={() => refresh()} disabled={refreshing}
              className="ops-btn flex items-center gap-1.5 bg-ops-purple/20 border-ops-purple/40
                         text-ops-purple hover:bg-ops-purple/30">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> SYNC
            </button>
          )}
          {queryId && (
            <button onClick={() => navigate(`/wellness?id=${queryId}`)}
              className="ops-btn flex items-center gap-1.5 bg-ops-green/10 border-ops-green/30
                         text-ops-green hover:bg-ops-green/20">
              <Heart size={13} /> WELLNESS
            </button>
          )}
        </div>
      </div>

      {!queryId ? (
        <div className="ops-card p-12 text-center">
          <Cpu size={40} className="text-ops-muted/30 mx-auto mb-4" />
          <p className="font-mono text-sm text-ops-muted">Enter an Employee ID to load their digital twin</p>
        </div>
      ) : twinLoading ? (
        <div className="ops-card p-12 text-center">
          <div className="w-8 h-8 border-2 border-ops-cyan/30 border-t-ops-cyan rounded-full animate-spin mx-auto mb-3" />
          <p className="font-mono text-xs text-ops-muted animate-pulse">LOADING TWIN DATA…</p>
        </div>
      ) : !twin ? (
        <div className="ops-card p-8 text-center">
          <p className="font-mono text-sm text-ops-red">TWIN NOT FOUND FOR {queryId}</p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="ops-card p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display text-lg font-bold text-ops-cyan tracking-widest">{queryId}</p>
              <p className="text-xs font-mono text-ops-muted mt-0.5">
                {twin.department} · Updated {new Date(twin.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <RiskBadge level={twin.risk_level} />
            </div>
          </div>

          {/* Gauge + stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="ops-card p-6 flex flex-col items-center">
              <BurnoutGauge value={twin.cognitive_battery ?? 100} size={180} />
              <div className="text-center mt-2">
                <p className="text-xs font-mono text-ops-muted">BURNOUT SCORE</p>
                <p className={`font-mono text-2xl font-bold mt-1 ${twin.burnout_score >= 75 ? 'text-ops-red' :
                  twin.burnout_score >= 55 ? 'text-ops-amber' : 'text-ops-green'
                  }`}>
                  {twin.burnout_score?.toFixed(1)}
                  <span className="text-sm font-normal text-ops-muted"> / 100</span>
                </p>
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <StatCard label="Efficiency" value={twin.efficiency?.toFixed(1) ?? '—'} unit="%" icon={Activity} accent="cyan" glow />
              <StatCard label="Total Events" value={twin.total_events ?? '—'} icon={Layers} accent="purple" />
              <StatCard label="Productive" value={twin.productive_events ?? '—'} icon={Zap} accent="green"
                sub={`${twin.distraction_events ?? 0} distractions`} />
              <StatCard label="Flow State" value={twin.focus_flow_state ? 'ACTIVE' : 'INACTIVE'} icon={Activity}
                accent={twin.focus_flow_state ? 'green' : 'amber'} />
            </div>
          </div>

          {/* Charts + logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="ops-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={14} className="text-ops-cyan" />
                <span className="text-xs font-mono tracking-wider text-ops-muted">ACTIVITY BREAKDOWN</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    dataKey="value" paddingAngle={3}>
                    {pieData.map(entry => (
                      <Cell key={entry.name} fill={CAT_COLORS[entry.name] || '#64748b'}
                        style={{ filter: `drop-shadow(0 0 6px ${CAT_COLORS[entry.name] || '#64748b'})` }} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0d1b2e', border: '1px solid #1e4068', borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="ops-card">
              <div className="px-5 py-4 border-b border-ops-border/50 flex items-center gap-2">
                <Clock size={14} className="text-ops-cyan" />
                <span className="text-xs font-mono tracking-wider text-ops-muted">RECENT ACTIVITY LOG</span>
              </div>
              <div className="divide-y divide-ops-border/20 max-h-56 overflow-y-auto">
                {statsLoading ? (
                  [...Array(6)].map((_, i) => (
                    <div key={i} className="px-5 py-3">
                      <div className="h-3 bg-ops-border/30 rounded animate-pulse" />
                    </div>
                  ))
                ) : stats?.logs?.map((log, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: CAT_COLORS[log.category] || '#64748b' }} />
                    <span className="text-xs font-mono text-ops-cyan w-20 shrink-0 truncate">{log.app_name}</span>
                    <span className="text-xs text-ops-muted flex-1 truncate">{log.window_title}</span>
                    <span className="text-xs font-mono text-ops-muted/60 shrink-0">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Forecast panel */}
          <ForecastPanel empId={queryId} />

          {/* Actuation History */}
          <ActuationHistoryPanel empId={queryId} />

          {/* AI insights */}
          <AIInsightPanel targetId={queryId} targetType="employee" />
        </>
      )}
    </div>
  )
}
