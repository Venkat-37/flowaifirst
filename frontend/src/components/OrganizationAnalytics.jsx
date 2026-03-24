import { useOrgHealth, useDepartmentIntelligence, useMbiCorrelation } from '../hooks/useApi'
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ScatterChart, Scatter, ZAxis
} from 'recharts'
import { Activity, Heart, Users, ShieldAlert, BarChart3, TrendingUp, ScatterChart as ScatterIcon } from 'lucide-react'

export default function OrganizationAnalytics() {
    const { data: healthData, isLoading: healthLoading } = useOrgHealth()
    const { data: deptData, isLoading: deptLoading } = useDepartmentIntelligence()
    const { data: mbiData, isLoading: mbiLoading } = useMbiCorrelation()

    // metrics
    const hMetrics = healthData?.metrics || {}
    const trends = healthData?.trend_7d || healthData?.historical_trends || []

    if (healthLoading || deptLoading) {
        return (
            <div className="h-64 flex items-center justify-center font-mono text-sm text-ops-cyan animate-pulse">
                CALCULATING ORGANIZATIONAL INTELLIGENCE...
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* ─── Global Health Score ─── */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="ops-card p-6 md:col-span-2 flex flex-col items-center justify-center border-ops-purple/30 bg-ops-purple/5">
                    <Heart size={24} className="text-ops-purple mb-3" />
                    <h2 className="text-sm font-mono tracking-widest text-ops-muted mb-2">ORG HEALTH SCORE</h2>
                    <div className="text-5xl font-display font-bold text-ops-purple" style={{ textShadow: '0 0 20px rgba(168, 85, 247, 0.4)' }}>
                        {healthData?.current_health_score?.toFixed(1) || '—'}
                    </div>
                    <p className="text-xs text-ops-muted mt-3 text-center px-4">
                        Aggregated index combining daily productivity, burnout risk, and weekly behavioral wellness metrics.
                    </p>
                </div>

                <div className="ops-card p-5 md:col-span-3">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp size={14} className="text-ops-purple" />
                        <h3 className="text-xs font-mono tracking-widest text-ops-muted">30-DAY HEALTH TREND</h3>
                        <span className="ml-auto text-[10px] font-mono bg-ops-purple/20 text-ops-purple px-2 py-0.5 rounded border border-ops-purple/30 hidden sm:inline">
                            DUAL-LAYER MODEL
                        </span>
                    </div>
                    <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trends} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Share Tech Mono' }} axisLine={false} tickLine={false} tickFormatter={(val) => val?.split('-').slice(1).join('/')} />
                                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Share Tech Mono' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0d1b2e', border: '1px solid #1e4068', borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 12 }}
                                />
                                <Line type="monotone" dataKey="health_score" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#a855f7' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ─── Global Metrics ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="ops-card p-4 text-center">
                    <Activity size={16} className="mx-auto mb-2 text-ops-cyan" />
                    <p className="font-mono text-xl font-bold text-ops-text">{hMetrics.avg_efficiency?.toFixed(1) || '—'}%</p>
                    <p className="text-[10px] font-mono tracking-wider text-ops-muted mt-1">AVG EFFICIENCY</p>
                </div>
                <div className="ops-card p-4 text-center">
                    <ShieldAlert size={16} className="mx-auto mb-2 text-ops-amber" />
                    <p className="font-mono text-xl font-bold text-ops-text">{hMetrics.avg_burnout?.toFixed(1) || '—'}</p>
                    <p className="text-[10px] font-mono tracking-wider text-ops-muted mt-1">AVG BURNOUT</p>
                </div>
                <div className="ops-card p-4 text-center border-ops-rose/20 bg-ops-rose/5 transform transition hover:scale-105">
                    <Heart size={16} className="mx-auto mb-2 text-ops-rose" />
                    <p className="font-mono text-xl font-bold text-ops-rose">{(hMetrics.avg_stress ?? 0).toFixed?.(1) || '—'}<span className="text-xs text-ops-muted font-normal">/10</span></p>
                    <p className="text-[10px] font-mono tracking-wider text-ops-muted mt-1">AVG STRESS</p>
                </div>
                <div className="ops-card p-4 text-center border-ops-green/20 bg-ops-green/5 transform transition hover:scale-105">
                    <Users size={16} className="mx-auto mb-2 text-ops-green" />
                    <p className="font-mono text-xl font-bold text-ops-green">{(hMetrics.avg_wlb ?? 0).toFixed?.(1) || '—'}<span className="text-xs text-ops-muted font-normal">/10</span></p>
                    <p className="text-[10px] font-mono tracking-wider text-ops-muted mt-1">WORK-LIFE BALANCE</p>
                </div>
            </div>

            {/* ─── Department Intelligence Table ─── */}
            <div className="ops-card overflow-hidden">
                <div className="px-5 py-4 border-b border-ops-border/50 flex items-center gap-2">
                    <BarChart3 size={14} className="text-ops-cyan" />
                    <span className="text-xs font-mono tracking-widest text-ops-muted">DEPARTMENTAL INTELLIGENCE</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="border-b border-ops-border/30 bg-ops-navy/30">
                                <th className="p-3 text-[10px] font-mono text-ops-muted tracking-wide">DEPARTMENT</th>
                                <th className="p-3 text-[10px] font-mono text-ops-muted tracking-wide text-center">HEADCOUNT</th>
                                <th className="p-3 text-[10px] font-mono text-ops-muted tracking-wide text-center">EFFICIENCY</th>
                                <th className="p-3 text-[10px] font-mono text-ops-muted tracking-wide text-center">BURNOUT</th>
                                <th className="p-3 text-[10px] font-mono text-ops-muted tracking-wide text-center">STRESS (1-10)</th>
                                <th className="p-3 text-[10px] font-mono text-ops-muted tracking-wide text-center">WLB (1-10)</th>
                                <th className="p-3 text-[10px] font-mono text-ops-muted tracking-wide text-center">HOURS/WK</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ops-border/20">
                            {(Array.isArray(deptData) ? deptData : deptData?.departments || [])?.map((d) => (
                                <tr key={d.department} className="hover:bg-ops-border/10 transition-colors">
                                    <td className="p-3 font-mono text-xs text-ops-cyan">{d.department}</td>
                                    <td className="p-3 font-mono text-xs text-center text-ops-muted/80">{d.employee_count}</td>
                                    <td className="p-3 font-mono text-xs text-center text-ops-text">{d.avg_efficiency}%</td>
                                    <td className="p-3 font-mono text-xs text-center">
                                        <span className={`px-2 py-0.5 rounded ${d.avg_burnout >= 55 ? 'bg-ops-amber/10 text-ops-amber border border-ops-amber/30' : 'text-ops-text'}`}>
                                            {d.avg_burnout}
                                        </span>
                                    </td>
                                    <td className="p-3 font-mono text-xs text-center text-ops-text">{d.avg_stress}</td>
                                    <td className="p-3 font-mono text-xs text-center text-ops-text">{d.avg_wlb}</td>
                                    <td className="p-3 font-mono text-xs text-center text-ops-muted">{d.avg_work_hours}</td>
                                </tr>
                            ))}
                            {(Array.isArray(deptData) ? deptData : deptData?.departments || [])?.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="p-8 text-center text-sm font-mono text-ops-muted italic">No departmental data available.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── MBI Validation Scatter Plot ─── */}
            <div className="ops-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-ops-border/20 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-ops-cyan/10 rounded border border-ops-cyan/20">
                            <ScatterIcon size={20} className="text-ops-cyan" />
                        </div>
                        <div>
                            <h3 className="font-mono text-sm tracking-widest text-ops-text">SCIENTIFIC VALIDATION</h3>
                            <p className="text-xs text-ops-muted mt-1 font-mono">
                                Telemetry Burnout vs Clinical MBI-GS (Cross-Sectional)
                            </p>
                        </div>
                    </div>
                    
                    {!mbiLoading && mbiData?.status === 'complete' && (
                        <div className="flex items-center gap-6 px-4 py-2 bg-ops-navy/40 rounded border border-ops-border/30">
                            <div>
                                <span className="block text-[10px] text-ops-muted font-mono tracking-wider">PEARSON R</span>
                                <span className={`font-mono font-bold ${mbiData.pearson_r > 0.6 ? 'text-ops-green' : mbiData.pearson_r > 0.3 ? 'text-ops-cyan' : 'text-ops-amber'}`}>
                                    {mbiData.pearson_r.toFixed(3)}
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-ops-muted font-mono tracking-wider">P-VALUE</span>
                                <span className="font-mono font-bold text-ops-text">
                                    {mbiData.p_value < 0.001 ? '< 0.001' : mbiData.p_value.toFixed(4)}
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-ops-muted font-mono tracking-wider">N PAIRS</span>
                                <span className="font-mono font-bold text-ops-text">
                                    {mbiData.paired_observations}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-[350px] w-full mt-2">
                    {mbiLoading ? (
                        <div className="w-full h-full flex items-center justify-center font-mono text-sm text-ops-muted animate-pulse">
                            CALCULATING CORRELATION MATRIX...
                        </div>
                    ) : mbiData?.status === 'complete' && mbiData?.scatter_data?.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis 
                                    type="number" 
                                    dataKey="burnout_score" 
                                    name="Telemetry Burnout" 
                                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Share Tech Mono' }}
                                    axisLine={{ stroke: '#334155' }}
                                    tickLine={false}
                                    domain={['auto', 'auto']}
                                    label={{ value: 'Telemetry Burnout Score', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12, fontFamily: 'Share Tech Mono' }}
                                />
                                <YAxis 
                                    type="number" 
                                    dataKey="composite_z" 
                                    name="MBI Z-Score" 
                                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Share Tech Mono' }}
                                    axisLine={{ stroke: '#334155' }}
                                    tickLine={false}
                                    domain={['auto', 'auto']}
                                    label={{ value: 'MBI Composite Z-Score', angle: -90, position: 'insideLeft', offset: 15, fill: '#64748b', fontSize: 12, fontFamily: 'Share Tech Mono' }}
                                />
                                <ZAxis type="category" dataKey="department" name="Department" />
                                <Tooltip 
                                    cursor={{ strokeDasharray: '3 3', stroke: '#334155' }}
                                    contentStyle={{ background: '#0d1b2e', border: '1px solid #1e4068', borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 12, padding: '10px 14px' }}
                                    itemStyle={{ color: '#00f0ff' }}
                                    formatter={(value, name) => [typeof value === 'number' ? value.toFixed(2) : value, name]}
                                    labelStyle={{ display: 'none' }}
                                />
                                <Scatter 
                                    name="Employees" 
                                    data={mbiData.scatter_data} 
                                    fill="#00f0ff" 
                                    fillOpacity={0.6}
                                />
                            </ScatterChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center font-mono text-sm text-ops-amber border border-ops-amber/20 bg-ops-amber/5 rounded">
                            {mbiData?.message || "Insufficient paired surveys for correlation analysis."}
                        </div>
                    )}
                </div>
                
                {!mbiLoading && mbiData?.status === 'complete' && (
                    <div className="mt-4 p-3 bg-ops-indigo/10 border border-ops-indigo/20 rounded-md">
                        <p className="text-xs font-mono text-ops-cyan">
                            <span className="font-bold tracking-wider mr-2">ANALYSIS:</span> 
                            {mbiData.interpretation}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
