export default function RiskBadge({ level }) {
  const cls = {
    LOW:      'badge-low',
    MEDIUM:   'badge-medium',
    HIGH:     'badge-high',
    CRITICAL: 'badge-critical',
  }[level?.toUpperCase()] || 'badge-low'
  return <span className={cls}>{level}</span>
}
