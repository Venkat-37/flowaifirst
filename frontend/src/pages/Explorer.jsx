import { useState } from 'react'
import { useEmployees } from '../hooks/useApi'
import RiskBadge from '../components/RiskBadge'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, ChevronLeft, ChevronRight, Users } from 'lucide-react'

const RISK_OPTS = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export default function Explorer() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ dept: '', risk: '', q: '', page: 1, per_page: 30 })
  const { data, isLoading } = useEmployees(filters)

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }))

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-ops-cyan tracking-widest">PERSONNEL REGISTRY</h1>
          <p className="text-xs font-mono text-ops-muted mt-1">{data?.total ?? '—'} RECORDS · SORTED BY RISK</p>
        </div>
        <Users size={18} className="text-ops-cyan opacity-50" />
      </div>

      {/* Filters */}
      <div className="ops-card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ops-muted" />
          <input
            className="ops-input w-full pl-8"
            placeholder="Search by ID or department…"
            value={filters.q}
            onChange={e => set('q', e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={13} className="text-ops-muted" />
          <select className="ops-input" value={filters.dept} onChange={e => set('dept', e.target.value)}>
            <option value="">All Departments</option>
            {data?.departments?.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <select className="ops-input" value={filters.risk} onChange={e => set('risk', e.target.value)}>
          <option value="">All Risk Levels</option>
          {RISK_OPTS.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select className="ops-input w-28"
                value={filters.per_page}
                onChange={e => setFilters(f => ({ ...f, per_page: +e.target.value, page: 1 }))}>
          {[15, 30, 60, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="ops-card overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-ops-border/50">
              {['EMP ID', 'DEPARTMENT', 'EFFICIENCY', 'BURNOUT', 'BATTERY', 'EVENTS', 'RISK', ''].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-ops-muted font-normal tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-ops-border/20">
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-ops-border/30 rounded animate-pulse" style={{ width: `${30 + Math.random() * 50}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.employees?.map(emp => (
              <tr key={emp.emp_id}
                  className="border-b border-ops-border/20 hover:bg-ops-cyan/3 cursor-pointer transition-colors"
                  onClick={() => navigate(`/twin?id=${emp.emp_id}`)}>
                <td className="px-5 py-3.5 text-ops-cyan font-semibold">{emp.emp_id}</td>
                <td className="px-5 py-3.5 text-ops-muted">{emp.department}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-ops-border rounded-full overflow-hidden">
                      <div className="h-full bg-ops-cyan rounded-full" style={{ width: `${emp.efficiency}%` }} />
                    </div>
                    <span className="text-ops-text">{emp.efficiency?.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className={emp.burnout_score >= 75 ? 'text-ops-red' : emp.burnout_score >= 55 ? 'text-ops-amber' : 'text-ops-text'}>
                    {emp.burnout_score?.toFixed(1)}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-ops-green">{emp.cognitive_battery?.toFixed(0)}%</td>
                <td className="px-5 py-3.5 text-ops-muted">{emp.total_events}</td>
                <td className="px-5 py-3.5"><RiskBadge level={emp.risk_level} /></td>
                <td className="px-5 py-3.5 text-ops-muted">›</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && !data?.employees?.length && (
          <div className="py-12 text-center font-mono text-ops-muted">NO PERSONNEL MATCHING FILTERS</div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-ops-muted">
            PAGE {data.page} / {data.pages} · {data.total} TOTAL
          </span>
          <div className="flex items-center gap-2">
            <button
              className="ops-btn py-1.5 px-3 flex items-center gap-1 disabled:opacity-30"
              disabled={data.page <= 1}
              onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>
              <ChevronLeft size={13} /> PREV
            </button>
            <button
              className="ops-btn py-1.5 px-3 flex items-center gap-1 disabled:opacity-30"
              disabled={data.page >= data.pages}
              onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>
              NEXT <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
