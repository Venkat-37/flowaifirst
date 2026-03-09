export default function BurnoutGauge({ value = 0, label = 'COGNITIVE BATTERY', size = 160 }) {
  // value = 0-100 (battery level, higher = better)
  const r      = (size / 2) * 0.78
  const cx     = size / 2
  const cy     = size / 2
  const stroke = size * 0.072
  const circumference = Math.PI * r   // half circle

  // Progress along the arc (180° arc from left to right, bottom hidden)
  const progress = Math.max(0, Math.min(100, value))
  const offset   = circumference * (1 - progress / 100)

  const color =
    progress >= 70 ? '#10b981' :
    progress >= 45 ? '#f59e0b' :
    '#dc2626'

  const riskLabel =
    progress >= 70 ? 'OPTIMAL' :
    progress >= 45 ? 'FATIGUE'  :
    'CRITICAL'

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#1e4068"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            filter: `drop-shadow(0 0 8px ${color})`,
            transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s ease',
          }}
        />
        {/* Center value */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
              fontFamily="'Share Tech Mono', monospace" fontSize={size * 0.16} fontWeight="bold">
          {Math.round(progress)}
        </text>
        <text x={cx} y={cy + size * 0.07} textAnchor="middle" fill="#64748b"
              fontFamily="'Share Tech Mono', monospace" fontSize={size * 0.07}>
          {riskLabel}
        </text>
      </svg>
      <span className="text-xs font-mono tracking-widest text-ops-muted">{label}</span>
    </div>
  )
}
