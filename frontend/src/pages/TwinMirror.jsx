import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTwin, useEmployeeStats, useRefreshTwin, useBurnoutForecast, useManualTrigger, useActuationHistory } from '../hooks/useApi'
import { useAuthStore } from '../store/authStore'
import axios from 'axios'
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
  'Productive': '#00E6C3',
  'Productive (Contextual)': '#10b981',
  'Neutral': '#4FA3FF',
  'Distraction': '#FF4C4C',
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
      <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[#f59e0b]" style={{ filter: 'drop-shadow(0 0 5px #f59e0b)' }} />
          <span className="text-[13px] font-mono tracking-[0.08em] font-medium uppercase text-ops-muted">BURNOUT FORECAST · 21-DAY</span>
          {forecast?.early_warning && (
            <span className="text-[11px] font-mono bg-[#FF4C4C]/20 text-[#FF4C4C] border border-[#FF4C4C]/30 px-2 py-0.5 rounded animate-pulse tracking-widest">
              ⚠ EARLY WARNING
            </span>
          )}
        </div>
        {isHRManager() && (
          <button onClick={() => setShowTrigger(s => !s)}
            className="flex items-center gap-1.5 text-[11px] font-mono text-[#00E6C3] border border-[#00E6C3]/30
                       px-3 py-1.5 rounded hover:bg-[#00E6C3]/10 transition-colors uppercase tracking-widest">
            <Bell size={12} /> ACTUATE
          </button>
        )}
      </div>

      <div className="p-6">
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
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={dirColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={dirColor} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                <Tooltip contentStyle={{
                  background: '#0B1623', border: '1px solid rgba(255,255,255,0.04)',
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
      <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.04)] flex items-center gap-2">
        <Bell size={16} className="text-[#8B5CF6]" style={{ filter: 'drop-shadow(0 0 5px rgba(139,92,246,0.6))' }} />
        <span className="text-[13px] font-mono tracking-[0.08em] font-medium uppercase text-ops-muted">ACTUATION HISTORY</span>
        <span className="font-mono text-[11px] text-ops-muted/70 ml-auto tracking-widest">{actuations.length} EVENTS</span>
      </div>
      <div className="p-6">
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

const RPCCapacityPanel = ({ empId }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empId) return
    axios.get(`/api/capacity/${empId}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [empId])

  if (loading) return <div className="ops-card p-4 text-ops-muted text-sm">Loading capacity…</div>
  if (!data) return null

  const riskColor = {
    CRITICAL: 'text-red-500', HIGH: 'text-amber-500',
    MEDIUM: 'text-yellow-400', LOW: 'text-green-400',
  }[data.capacity_risk] || 'text-ops-muted'

  const pct = Math.round(data.current_rpc)
  const strokeDash = (pct / 100) * 283

  return (
    <div className="ops-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-ops-text text-sm">Remaining Productive Capacity</h3>
          <p className="text-xs text-ops-muted">ODE demand-recovery model · 8h forecast</p>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${riskColor} border-current/30`}>
          {data.capacity_risk}
        </span>
      </div>

      <div className="flex items-center gap-6 mb-4">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
          <circle cx="50" cy="50" r="45" fill="none"
            stroke={data.capacity_risk === 'CRITICAL' ? '#ef4444' :
                    data.capacity_risk === 'HIGH'     ? '#f59e0b' :
                    data.capacity_risk === 'MEDIUM'   ? '#eab308' : '#10b981'}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${strokeDash} 283`}
            strokeDashoffset="0"
            transform="rotate(-90 50 50)"
            style={{transition: 'stroke-dasharray 0.8s ease'}}
          />
          <text x="50" y="46" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">{pct}</text>
          <text x="50" y="60" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">/100</text>
        </svg>

        <div className="space-y-2 flex-1">
          {[['In 1 hour', data.rpc_1h], ['In 4 hours', data.rpc_4h], ['End of day', data.rpc_8h]].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-ops-muted">{label}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-ops-cyan/60 rounded-full"
                       style={{width: `${Math.round(val)}%`, transition: 'width 0.6s ease'}}/>
                </div>
                <span className="text-xs text-ops-text w-8 text-right">{Math.round(val)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-ops-muted leading-relaxed border-t border-ops-border/30 pt-3">
        {data.narrative}
      </p>

      {!data.params_fitted && (
        <p className="text-xs text-amber-500/70 mt-2">
          ⚠ Using population defaults — parameters personalise after 3 days of history
        </p>
      )}
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
    <div className="flex flex-col gap-6 animate-slide-up">
      <div className="ops-card p-6 min-h-[100px] flex items-center justify-between flex-wrap gap-4 border border-[rgba(255,255,255,0.04)] rounded-[14px] bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)]">
        <div>
          <h1 className="font-display text-[16px] font-medium text-ops-cyan uppercase tracking-[0.08em]">TWIN MIRROR</h1>
          <p className="text-[13px] font-body text-ops-muted mt-1">AI-powered digital twin monitoring employee productivity and wellness signals</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            className="ops-input w-40 font-mono text-[13px] uppercase px-3 py-2 rounded-md bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] focus:border-ops-cyan"
            placeholder="EMP001"
            value={empInput}
            onChange={e => setEmpInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {queryId && (
            <button onClick={() => refresh()} disabled={refreshing}
              className="ops-btn h-9 px-4 rounded-md flex items-center gap-2 bg-transparent border border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.05)] text-[#e2e8f0] text-[12px] transition-all duration-200 uppercase tracking-widest">
              <RefreshCw size={14} className={refreshing ? 'animate-spin cursor-not-allowed' : ''} /> SYNC
            </button>
          )}
          {queryId && (
            <button onClick={() => navigate(`/wellness?id=${queryId}`)}
              className="ops-btn flex items-center gap-2 bg-[#00e6c3]/15 text-[#00e6c3] border border-[#00e6c3]/40 hover:bg-[#00e6c3]/25 shadow-[0_0_10px_rgba(0,230,195,0.2)] transition-all duration-200">
              <Heart size={16} /> WELLNESS
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

          {/* Main 12-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2">

            {/* --- LEFT PANE (8 Columns) - Primary Analytics --- */}
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* Hero Gauge + Stats */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

                {/* Hero Dominating Card 1.6x sizing */}
                <div className="md:col-span-5 ops-card p-6 min-h-[290px] flex flex-col items-center justify-center">
                  <BurnoutGauge value={twin.cognitive_battery ?? 100} size={220} />
                  <div className="text-center mt-5">
                    <p className="text-[11px] font-mono text-ops-muted tracking-[0.08em] opacity-70">BURNOUT SCORE</p>
                    <p className={`font-mono text-[36px] font-semibold mt-1 leading-none drop-shadow-md ${twin.burnout_score >= 75 ? 'text-[#FF4C4C]' :
                      twin.burnout_score >= 55 ? 'text-[#f59e0b]' : 'text-[#00E6C3]'
                      }`}>
                      {twin.burnout_score?.toFixed(1)}
                      <span className="text-[14px] font-normal text-ops-muted/50"> / 100</span>
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="md:col-span-7 grid grid-cols-2 gap-6 auto-rows-fr">
                  <StatCard label="Efficiency" value={twin.efficiency?.toFixed(1) ?? '—'} unit="%" icon={Activity} accent="cyan" glow />
                  <StatCard label="Total Events" value={twin.total_events ?? '—'} icon={Layers} accent="purple" />
                  <StatCard label="Productive" value={twin.productive_events ?? '—'} icon={Zap} accent="green"
                    sub={`${twin.distraction_events ?? 0} distractions`} />
                  <StatCard label="Flow State" value={twin.focus_flow_state ? 'ACTIVE' : 'INACTIVE'} icon={Activity}
                    accent={twin.focus_flow_state ? 'green' : 'red'} />
                </div>
              </div>

              {/* RPC Capacity Panel — after burnout gauge */}
              <RPCCapacityPanel empId={queryId} />

              {/* Activity Chart */}
              <div className="ops-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={16} className="text-[#00E6C3]" />
                  <span className="text-[13px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">ACTIVITY BREAKDOWN</span>
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={95}
                        dataKey="value" paddingAngle={3}>
                        {pieData.map(entry => (
                          <Cell key={entry.name} fill={CAT_COLORS[entry.name] || '#4FA3FF'}
                            style={{ filter: `drop-shadow(0 0 8px ${CAT_COLORS[entry.name] || '#4FA3FF'})` }} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#0B1623', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, fontFamily: 'Share Tech Mono', fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Share Tech Mono', opacity: 0.7 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Forecast panel */}
              <ForecastPanel empId={queryId} />

              {/* AI insights */}
              <AIInsightPanel targetId={queryId} targetType="employee" />
            </div>

            {/* --- RIGHT PANE (4 Columns) - Secondary & Interaction --- */}
            <div className="lg:col-span-4 flex flex-col gap-6">

              {/* Recent Activity Log */}
              <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px]">
                <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.04)] flex items-center gap-2 bg-[rgba(255,255,255,0.01)] rounded-t-[14px]">
                  <Clock size={16} className="text-[#00E6C3]" />
                  <span className="text-[13px] font-mono font-medium tracking-[0.08em] uppercase text-ops-muted">RECENT ACTIVITY LOG</span>
                </div>
                <div className="divide-y divide-[rgba(255,255,255,0.04)] max-h-[400px] overflow-y-auto custom-scrollbar">
                  {statsLoading ? (
                    [...Array(6)].map((_, i) => (
                      <div key={i} className="px-6 py-4">
                        <div className="h-3 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                      </div>
                    ))
                  ) : stats?.logs?.map((log, i) => (
                    <div key={i} className="px-6 py-4 flex items-center gap-3 hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                      <div className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: CAT_COLORS[log.category] || '#4FA3FF', filter: `drop-shadow(0 0 4px ${CAT_COLORS[log.category] || '#4FA3FF'})` }} />
                      <span className="text-[11px] font-mono text-[#00E6C3] w-24 shrink-0 truncate">{log.app_name}</span>
                      <span className="text-[13px] text-ops-muted flex-1 truncate opacity-80">{log.window_title}</span>
                      <span className="text-[11px] font-mono text-ops-muted opacity-60 shrink-0">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actuation History */}
              <ActuationHistoryPanel empId={queryId} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
