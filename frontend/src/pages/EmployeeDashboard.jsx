import { useAuthStore } from '../store/authStore'
import { useEmployeeStats, useTwin } from '../hooks/useApi'
import BurnoutGauge from '../components/BurnoutGauge'
import RiskBadge from '../components/RiskBadge'
import AIInsightPanel from '../components/AIInsightPanel'
import StatCard from '../components/StatCard'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Activity, Clock, Zap, Layers } from 'lucide-react'

const CAT_COLORS = {
  'Productive':              '#10b981',
  'Productive (Contextual)': '#06b6d4',
  'Neutral':                 '#64748b',
  'Distraction':             '#dc2626',
}

export default function EmployeeDashboard() {
  const { user } = useAuthStore()
  const empId = user?.emp_id || 'EMP001'
  const { data: twin,  isLoading: twinLoading  } = useTwin(empId)
  const { data: stats, isLoading: statsLoading } = useEmployeeStats(empId)

  const pieData = stats?.category_counts
    ? Object.entries(stats.category_counts).map(([name, value]) => ({ name, value }))
    : []

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-ops-cyan tracking-widest">MY TWIN PROFILE</h1>
          <p className="text-xs font-mono text-ops-muted mt-1">
            {empId} · {twin?.department || '—'} · PERSONAL COGNITIVE MODEL
          </p>
        </div>
        {twin && <RiskBadge level={twin.risk_level} />}
      </div>

      {/* Gauge + stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="ops-card p-6 flex flex-col items-center">
          {twinLoading ? (
            <div className="h-32 flex items-center justify-center text-ops-muted font-mono text-sm">LOADING…</div>
          ) : (
            <>
              <BurnoutGauge value={twin?.cognitive_battery ?? 100} size={180} />
              <div className="text-center mt-2">
                <p className="text-xs font-mono text-ops-muted">BURNOUT SCORE</p>
                <p className={`font-mono text-2xl font-bold mt-1 ${
                  (twin?.burnout_score ?? 0) >= 75 ? 'text-ops-red' :
                  (twin?.burnout_score ?? 0) >= 55 ? 'text-ops-amber' : 'text-ops-green'
                }`}>
                  {twin?.burnout_score?.toFixed(1) ?? '—'}
                  <span className="text-sm font-normal text-ops-muted"> / 100</span>
                </p>
              </div>
            </>
          )}
        </div>

        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          <StatCard label="Efficiency" value={twin?.efficiency?.toFixed(1) ?? '—'} unit="%" icon={Activity} accent="cyan" glow />
          <StatCard label="Total Events" value={twin?.total_events ?? '—'} icon={Layers} accent="purple" />
          <StatCard label="Productive" value={twin?.productive_events ?? '—'} icon={Zap} accent="green"
                     sub={`${twin?.distraction_events ?? 0} distractions`} />
          <StatCard label="Flow State" value={twin?.focus_flow_state ? 'ACTIVE' : 'INACTIVE'} icon={Activity}
                     accent={twin?.focus_flow_state ? 'green' : 'amber'} />
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
            <span className="text-xs font-mono tracking-wider text-ops-muted">RECENT ACTIVITY</span>
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

      <AIInsightPanel targetId={empId} targetType="employee" />
    </div>
  )
}
