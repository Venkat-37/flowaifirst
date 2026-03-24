import { useAuthStore } from '../store/authStore'
import { useEmployeeStats, useTwin, useSyncTwin, useLiveActivity, useTrackingStatus, useToggleTracking, useEmployeeProfile, usePredictiveProfile, useLogMood, useOrgHealth } from '../hooks/useApi'
import BurnoutGauge from '../components/BurnoutGauge'
import RiskBadge from '../components/RiskBadge'
import StatCard from '../components/StatCard'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { Activity, Clock, Zap, Layers, RefreshCw, Radio, Play, Square, Terminal, Briefcase, Heart, Brain, Users, Home, BarChart3, TrendingDown, TrendingUp, AlertOctagon, Battery, HelpCircle } from 'lucide-react'

// Golden ratio rhythm: 8, 13, 21, 34, 55

const CAT_COLORS = {
  'Productive': '#10b981', // green
  'Productive (Contextual)': '#10b981', // green
  'Neutral': '#3b82f6', // blue
  'Distraction': '#ef4444', // red
}

export default function EmployeeDashboard() {
  const { user } = useAuthStore()
  const empId = user?.emp_id || 'EMP001'
  const { data: twin, isLoading: twinLoading } = useTwin(empId)
  const { data: stats } = useEmployeeStats(empId)
  const { mutate: sync, isPending: syncing } = useSyncTwin(empId)
  const { mutate: logMood, isPending: loggingMood } = useLogMood(empId)
  const { data: liveData, isLoading: liveLoading } = useLiveActivity(empId)
  const { data: trackingData } = useTrackingStatus(empId)
  const { mutate: toggleTracking, isPending: toggling } = useToggleTracking(empId)
  const { data: profile } = useEmployeeProfile(empId)
  const { data: predictive } = usePredictiveProfile(empId)
  const { data: orgHealth } = useOrgHealth()

  const isTracking = trackingData?.active || false

  const pieData = stats?.category_counts
    ? Object.entries(stats.category_counts).map(([name, value]) => ({ name, value }))
    : []

  const radarData = [
    { subject: 'Productivity', value: Math.round(twin?.efficiency || 0), orgAvg: Math.round(orgHealth?.metrics?.avg_efficiency || 0), fullMark: 100 },
    { subject: 'Wellness', value: Math.max(0, 100 - Math.round(twin?.burnout_score || 0)), orgAvg: Math.max(0, 100 - Math.round(orgHealth?.metrics?.avg_burnout || 0)), fullMark: 100 },
    { subject: 'Focus', value: Math.min(100, (twin?.deep_work_units || 0) * 10), orgAvg: 65, fullMark: 100 },
    { subject: 'Balance', value: Math.min(100, (profile?.work_life_balance ?? twin?.work_life_balance ?? 5) * 10), orgAvg: Math.min(100, (orgHealth?.metrics?.avg_wlb || 5) * 10), fullMark: 100 },
  ]

  const totalEvents = liveData?.daily_summary?.total_events || 0;
  const prodEvents = liveData?.daily_summary?.productive || 0;
  const distEvents = liveData?.daily_summary?.distraction || 0;
  const neutEvents = liveData?.daily_summary?.neutral || 0;

  const prodPct = totalEvents > 0 ? (prodEvents / totalEvents) * 100 : 0;
  const distPct = totalEvents > 0 ? (distEvents / totalEvents) * 100 : 0;
  const neutPct = totalEvents > 0 ? (neutEvents / totalEvents) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 animate-slide-up text-[#e2e8f0]">
      {/* ── STEP 2: TOP HEADER BANNER ── */}
      <div className="ops-card min-h-[100px] flex items-center justify-between flex-wrap gap-4 border border-[rgba(255,255,255,0.04)] rounded-[14px] bg-[#0B1623] p-6 shadow-[0_10px_25px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <h1 className="text-[16px] font-display font-medium text-ops-cyan uppercase tracking-[0.08em] leading-none">MY PROFILE</h1>
            <p className="text-[13px] font-body text-ops-muted mt-2 leading-none">
              {empId} · AI-powered digital twin monitoring employee productivity and wellness signals
            </p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-[rgba(255,255,255,0.1)] mx-2" />

          {/* Tracking Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isTracking ? 'bg-[#00E6C3]/20 shadow-[0_0_20px_rgba(0,230,195,0.3)]' : 'bg-[rgba(255,255,255,0.05)]'}`}>
                <Radio size={16} className={isTracking ? 'text-[#00E6C3] animate-pulse' : 'text-[#64748b]'} />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[11px] font-mono tracking-widest text-ops-muted uppercase leading-none mb-1">Agent Status</span>
                <span className={`text-[12px] font-bold leading-none ${isTracking ? 'text-[#00E6C3]' : 'text-[#64748b]'}`}>
                  {isTracking ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>

            <button
              onClick={() => toggleTracking(isTracking ? 'stop' : 'start')}
              disabled={toggling}
              className={`h-9 px-4 rounded-md flex items-center gap-2 text-[12px] font-mono font-bold transition-all ${isTracking
                ? 'bg-[#FF4C4C]/10 text-[#FF4C4C] hover:bg-[#FF4C4C]/20 shadow-[0_0_15px_rgba(255,76,76,0.15)]'
                : 'bg-[#00E6C3]/10 text-[#00E6C3] hover:bg-[#00E6C3]/20 shadow-[0_0_15px_rgba(0,230,195,0.15)]'
                }`}
            >
              {isTracking ? <Square size={14} /> : <Play size={14} />}
              {isTracking ? 'STOP TRACKING' : 'START TRACKING'}
            </button>

            {isTracking && (
              <code className="hidden xl:block text-[11px] font-mono text-[#8b5cf6] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 rounded border border-[#8b5cf6]/20">
                python monitor_agent.py --emp-id {empId}
              </code>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => sync()} disabled={syncing}
            className="ops-btn h-9 px-4 rounded-md flex items-center gap-2 bg-transparent border border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.05)] text-[#e2e8f0] text-[12px] transition-all duration-200 uppercase tracking-widest">
            <RefreshCw size={14} className={syncing ? 'animate-spin cursor-not-allowed' : ''} /> SYNC
          </button>
          {twin && <RiskBadge level={twin.risk_level} />}
        </div>
      </div>

      {/* ── STEP 1: 12-COLUMN OVERALL GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2 relative z-10 w-full">

        {/* ========================================================= */}
        {/* ── PRIMARY AREA (LEFT - 8 COLUMNS) ──                       */}
        {/* ========================================================= */}
        <div className="col-span-1 lg:col-span-8 flex flex-col gap-6">

          {/* Row 1 - Hero Metric + Burnout Forecast  */}
          <div className="grid grid-cols-1 lg:grid-cols-11 gap-6">

            {/* HERO METRIC: Cognitive Battery (5 col) */}
            <div className="col-span-1 lg:col-span-5 ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 flex flex-col items-center justify-between text-center relative overflow-hidden min-h-[300px]">
              <div className="absolute top-0 left-0 w-[4px] h-full bg-[#00E6C3] shadow-[0_0_21px_#00E6C3]" />

              <span className="text-[12px] font-mono font-medium text-ops-muted tracking-[0.08em] uppercase mb-4 block">Cognitive Battery</span>

              {/* Gauge (1.6x size) */}
              <div className="scale-125 origin-center transform translate-y-3 mb-6">
                <BurnoutGauge value={twin?.cognitive_battery ?? 100} size={200} />
              </div>

              {/* Activity Progress */}
              <div className="w-full mt-auto pt-4 relative z-10">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[11px] font-mono tracking-widest text-ops-muted">TODAY ACTIVITY</span>
                </div>
                <div className="h-[10px] w-full rounded flex overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                  <div style={{ width: `${prodPct}%` }} className="bg-[#00E6C3] transition-all duration-500 hover:brightness-110" title={`Productive: ${prodEvents}`} />
                  <div style={{ width: `${distPct}%` }} className="bg-[#FF4C4C] transition-all duration-500 hover:brightness-110" title={`Distraction: ${distEvents}`} />
                  <div style={{ width: `${neutPct}%` }} className="bg-[#4FA3FF] transition-all duration-500 hover:brightness-110" title={`Neutral: ${neutEvents}`} />
                </div>
                <div className="flex justify-center gap-4 mt-3">
                  <span className="text-[11px] text-[#00E6C3] font-mono flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#00E6C3] shadow-[0_0_6px_#00E6C3]" /> Prod</span>
                  <span className="text-[11px] text-[#FF4C4C] font-mono flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#FF4C4C] shadow-[0_0_6px_#FF4C4C]" /> Dist</span>
                  <span className="text-[11px] text-[#4FA3FF] font-mono flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#4FA3FF] shadow-[0_0_6px_#4FA3FF]" /> Neut</span>
                </div>
              </div>
            </div>

            {/* Right side of Top Row (6 col remaining: split into two rows for Efficiency/Flow and Forecast) */}
            <div className="col-span-1 lg:col-span-6 flex flex-col gap-6">

              {/* Top half mini row: Efficiency | Flow State (3 cols each visually) */}
              <div className="grid grid-cols-2 gap-6 flex-1">
                <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity size={16} className="text-[#00E6C3]" />
                    <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Efficiency</span>
                  </div>
                  <span className="text-[36px] font-semibold text-[#e2e8f0] leading-none drop-shadow-md">
                    {twin?.efficiency?.toFixed(1) ?? '—'}<span className="text-[20px] text-[#00E6C3] ml-1 opacity-80">%</span>
                  </span>
                </div>

                <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 flex flex-col justify-center relative overflow-hidden group">
                  <div className="flex items-center gap-2 mb-4 relative z-10">
                    <Zap size={16} className={twin?.focus_flow_state ? 'text-[#00E6C3]' : 'text-[#FF4C4C]'} />
                    <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Flow State</span>
                  </div>
                  {twin?.focus_flow_state && <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-[#00E6C3] rounded-full blur-[40px] opacity-20 pointer-events-none group-hover:opacity-30 transition-opacity" />}
                  {(!twin?.focus_flow_state) && <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-[#FF4C4C] rounded-full blur-[40px] opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity" />}
                  <span className={`text-[30px] font-semibold leading-none relative z-10 2xl:text-[36px] ${twin?.focus_flow_state ? 'text-[#00E6C3] drop-shadow-[0_0_10px_rgba(0,230,195,0.4)]' : 'text-[#FF4C4C] drop-shadow-[0_0_10px_rgba(255,76,76,0.2)]'}`}>
                    {twin?.focus_flow_state ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
              </div>

              {/* Bottom half mini row: Burnout Forecast Moved Up */}
              <div className="ops-card bg-gradient-to-r from-[#0B1623] to-[rgba(139,92,246,0.05)] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 border-b-[4px] border-b-[#8b5cf6] flex-1 flex flex-col justify-center relative group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#8b5cf6] rounded-full blur-[60px] opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity" />
                <div className="flex justify-between items-center mb-4 relative z-10">
                  <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-[#e2e8f0] uppercase flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#8b5cf6]" /> AI Burnout Forecast
                  </span>
                  {predictive?.burnout_forecast?.trend && (
                    <span className={`text-[11px] font-mono tracking-widest font-bold ${predictive.burnout_forecast.trend === 'DETERIORATING' ? 'text-[#FF4C4C] bg-[#FF4C4C]/10 px-2 py-0.5 rounded' : predictive.burnout_forecast.trend === 'IMPROVING' ? 'text-[#00E6C3] bg-[#00E6C3]/10 px-2 py-0.5 rounded' : 'text-[#4FA3FF] bg-[#4FA3FF]/10 px-2 py-0.5 rounded'}`}>
                      {predictive.burnout_forecast.trend}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-end mt-auto relative z-10 w-full">
                  <div>
                    <span className="text-[11px] font-mono text-ops-muted tracking-widest block mb-1">CURRENT</span>
                    <span className="text-[36px] font-semibold text-[#e2e8f0] leading-none drop-shadow-sm">{predictive?.burnout_forecast?.current_score?.toFixed(1) || '—'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-mono text-[#8b5cf6] tracking-widest block mb-1">+7 DAYS</span>
                    <span className="text-[20px] font-semibold text-[#8b5cf6] leading-none drop-shadow-[0_0_8px_rgba(139,92,246,0.4)]">{predictive?.burnout_forecast?.forecast_7d?.toFixed(1) || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Row 2 - Behavioral Profile | Digital Twin Metrics */}
          {/* Row 2 - ODE Capacity Engine & CMAB Interventions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* ODE Capacity Forecast */}
            <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Battery size={48} className="text-[#00E6C3]" />
              </div>
              
              <div className="flex items-center gap-2 mb-6">
                <TrendingDown size={16} className="text-[#00E6C3]" />
                <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">8h Capacity Forecast (ODE)</span>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[11px] font-mono text-ops-muted tracking-widest block mb-1">CURRENT RPC</span>
                    <span className="text-[32px] font-semibold text-[#e2e8f0] leading-none">{twin?.rpc_current?.toFixed(0) ?? '—'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-mono text-[#00E6C3] tracking-widest block mb-1">EOD FORECAST</span>
                    <span className={`text-[32px] font-semibold leading-none ${twin?.rpc_8h < 20 ? 'text-[#FF4C4C]' : 'text-[#00E6C3]'}`}>
                      {twin?.rpc_8h?.toFixed(0) ?? '—'}
                    </span>
                  </div>
                </div>

                {/* Progress bar simulation for capacity decay */}
                <div className="relative h-2 w-full bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                   <div 
                    className={`absolute inset-y-0 left-0 transition-all duration-1000 ${twin?.rpc_8h < 20 ? 'bg-[#FF4C4C]' : 'bg-gradient-to-r from-[#00E6C3] to-[#4FA3FF]'}`}
                    style={{ width: `${twin?.rpc_8h ?? 0}%` }}
                   />
                </div>
                
                <p className="text-[12px] text-ops-muted italic leading-relaxed mt-2">
                  {twin?.rpc_8h < 40 
                    ? "⚠ Critical capacity collapse predicted by end of day. Adaptive intervention recommended."
                    : "✓ ODE model predicts stable productive capacity for the remainder of your shift."}
                </p>
              </div>
            </div>

            {/* CMAB Adaptive Interventions */}
            <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Heart size={16} className="text-[#FF4C4C]" />
                  <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Adaptive Interventions</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-ops-muted bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded">
                   <HelpCircle size={10} /> Thompson Sampling Active
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                {twin?.actions && twin.actions.length > 0 ? (
                  twin.actions.map((action, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-all group">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#FF4C4C] group-hover:scale-125 transition-transform" />
                      <span className="text-[12px] text-[#e2e8f0] font-body">{action}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] text-ops-muted italic p-4 text-center border border-dashed border-[rgba(255,255,255,0.1)] rounded-lg">
                    No active interventions. Stay focused!
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Behavioral Profile (8 cols) */}
            <div className="lg:col-span-8 ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6">
              <div className="flex items-center gap-2 mb-6">
                <Brain size={16} className="text-[#8b5cf6]" />
                <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Behavioral Profile</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <span className="text-[11px] font-mono text-ops-muted tracking-widest block mb-2">STRESS</span>
                  <span className={`text-[36px] font-semibold leading-none ${(profile?.stress_level ?? twin?.stress_level ?? 5) >= 7 ? 'text-[#FF4C4C]' : 'text-[#00E6C3]'}`}>
                    {profile?.stress_level ?? twin?.stress_level ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-ops-muted tracking-widest block mb-2">HRS/WK</span>
                  <span className="text-[36px] font-semibold text-[#e2e8f0] leading-none">
                    {(profile?.work_hours_per_week ?? twin?.work_hours_per_week)?.toFixed(0) ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-ops-muted tracking-widest block mb-2">MEETINGS</span>
                  <span className="text-[36px] font-semibold text-[#e2e8f0] leading-none">
                    {profile?.meetings_per_week ?? twin?.meetings_per_week ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-ops-muted tracking-widest block mb-2">WFH/WK</span>
                  <span className="text-[36px] font-semibold text-[#00E6C3] leading-none">
                    {profile?.wfh_days_per_week ?? twin?.wfh_days_per_week ?? '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Digital Twin Metrics Radar (4 cols) */}
            <div className="lg:col-span-4 ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 flex flex-col items-center">
              <div className="flex items-center gap-2 self-start w-full mb-2">
                <Radio size={16} className="text-[#4FA3FF]" />
                <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Twin Metrics</span>
              </div>
              <div className="w-full flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius={85} data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#e2e8f0', fontSize: 11, fontFamily: 'Share Tech Mono' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Employee" dataKey="value" stroke="#4FA3FF" fill="#4FA3FF" fillOpacity={0.2} strokeWidth={2} style={{ filter: 'drop-shadow(0 0 10px rgba(79,163,255,0.4))' }} />
                    <Tooltip contentStyle={{ background: '#0B1623', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px' }} itemStyle={{ fontSize: 11, fontFamily: 'Share Tech Mono' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 3 - Work Balance */}
          <div className="w-full">
            {/* Deep Work Balance */}
            <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-[#8b5cf6]" />
                  <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Deep Work Units</span>
                </div>
                <span className="text-[36px] font-semibold text-[#e2e8f0] leading-none">{twin?.deep_work_units ?? 0}</span>
              </div>
              <div className="h-3 w-full bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-[#8b5cf6] shadow-[0_0_10px_#8b5cf6] transition-all duration-500 hover:brightness-110"
                  style={{ width: `${Math.min(((twin?.deep_work_units ?? 0) / 10) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

        </div>

        {/* ========================================================= */}
        {/* ── SECONDARY AREA (RIGHT - 4 COLUMNS) ──                    */}
        {/* ========================================================= */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">

          {/* Activity Breakdown (Pie Chart) */}
          <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] p-6 flex flex-col relative overflow-hidden min-h-[320px]">
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#4FA3FF] rounded-full blur-[80px] opacity-10 pointer-events-none" />
            <div className="flex items-center gap-2 mb-6 shrink-0 relative z-10">
              <Activity size={16} className="text-[#00E6C3]" />
              <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Activity Breakdown</span>
            </div>
            <div className="flex-1 w-full relative z-10 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={95} dataKey="value" paddingAngle={3} stroke="none">
                    {pieData.map(entry => (
                      <Cell key={entry.name} fill={CAT_COLORS[entry.name] || '#4FA3FF'} style={{ filter: `drop-shadow(0 0 8px ${CAT_COLORS[entry.name] || '#4FA3FF'})` }} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0B1623', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px' }} itemStyle={{ color: '#e2e8f0', fontSize: 11, fontFamily: 'Share Tech Mono' }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Share Tech Mono', opacity: 0.7 }} />
                </PieChart>
              </ResponsiveContainer>
              {pieData.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-[12px] text-ops-muted italic">No data</p>
                </div>
              )}
            </div>
          </div>

          {/* Live Activity Monitor */}
          <div className="ops-card bg-[#0B1623] border border-[rgba(255,255,255,0.04)] shadow-[0_10px_25px_rgba(0,0,0,0.35)] rounded-[14px] flex flex-col h-[500px]">
            <div className="p-6 border-b border-[rgba(255,255,255,0.04)] flex justify-between items-center bg-[rgba(255,255,255,0.01)] rounded-t-[14px]">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[#00E6C3]" />
                <span className="text-[12px] font-mono font-medium tracking-[0.08em] text-ops-muted uppercase">Live Monitor</span>
              </div>
              {liveData?.current_app && (
                <div className="flex items-center gap-2 px-3 py-1 bg-[#00E6C3]/10 rounded shadow-[inset_0_0_10px_rgba(0,230,195,0.1)]">
                  <span className="w-2 h-2 rounded-full bg-[#00E6C3] shadow-[0_0_8px_#00E6C3] animate-pulse" />
                  <span className="text-[11px] font-bold text-[#00E6C3] tracking-widest">LIVE</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-2">
              {liveLoading ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="p-3">
                    <div className="h-4 w-1/4 bg-[rgba(255,255,255,0.05)] rounded mb-2 animate-pulse" />
                    <div className="h-3 w-3/4 bg-[rgba(255,255,255,0.02)] rounded animate-pulse" />
                  </div>
                ))
              ) : !liveData?.events || liveData.events.length === 0 ? (
                <div className="h-full flex items-center justify-center p-8">
                  <p className="text-[12px] text-ops-muted italic">No active telemetry</p>
                </div>
              ) : liveData.events.map((log, i) => {
                const isLatest = i === 0;
                const catColor = CAT_COLORS[log.category] || '#4FA3FF';
                return (
                  <div key={i} className={`p-4 flex flex-col gap-2 rounded-[10px] transition-all duration-200 ${isLatest ? 'bg-[#4FA3FF]/10 shadow-[inner_0_0_10px_rgba(79,163,255,0.1)]' : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent hover:border-[rgba(255,255,255,0.04)]'}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full shadow-[0_0_6px_currentColor]" style={{ backgroundColor: catColor, color: catColor }} />
                        <span className={`text-[12px] font-bold max-w-[150px] truncate ${isLatest ? 'text-[#4FA3FF]' : 'text-ops-cyan'}`}>{log.app_name}</span>
                      </div>
                      <span className="text-[11px] font-mono text-ops-muted">
                        {log.seconds_ago != null ? (log.seconds_ago < 60 ? `${log.seconds_ago}s ago` : log.seconds_ago < 3600 ? `${Math.floor(log.seconds_ago / 60)}m ago` : `${Math.floor(log.seconds_ago / 3600)}h ago`) : log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div className="pl-5 text-[12px] text-ops-muted break-words line-clamp-2 leading-relaxed opacity-80">
                      {log.window_title || 'Unknown Window Content'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
