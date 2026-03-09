export default function StatCard({ label, value, unit = '', sub, accent = 'cyan', icon: Icon, glow }) {
  const colors = {
    cyan:   { val: 'text-ops-cyan',   glow: 'shadow-cyan-glow',  border: 'border-ops-cyan/30' },
    green:  { val: 'text-ops-green',  glow: 'shadow-green-glow', border: 'border-ops-green/30' },
    amber:  { val: 'text-ops-amber',  glow: 'shadow-amber-glow', border: 'border-ops-amber/30' },
    red:    { val: 'text-ops-red',    glow: 'shadow-red-glow',   border: 'border-ops-red/30' },
    purple: { val: 'text-ops-purple', glow: '',                  border: 'border-ops-purple/30' },
  }
  const c = colors[accent] || colors.cyan

  return (
    <div className={`ops-card p-5 ${glow ? c.glow : ''} animate-slide-up`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-mono tracking-widest text-ops-muted uppercase">{label}</span>
        {Icon && <Icon size={16} className={`${c.val} opacity-60`} />}
      </div>
      <div className="flex items-end gap-1">
        <span className={`font-mono text-3xl font-bold ${c.val}`}
              style={{ textShadow: accent === 'cyan' ? '0 0 20px rgba(0,180,216,0.5)' : undefined }}>
          {value ?? '—'}
        </span>
        {unit && <span className="text-sm font-mono text-ops-muted mb-1">{unit}</span>}
      </div>
      {sub && <p className="text-xs text-ops-muted mt-2 font-body">{sub}</p>}
    </div>
  )
}
