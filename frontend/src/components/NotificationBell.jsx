import { useState, useRef, useEffect } from 'react'
import { Bell, X, Check, CheckCheck, AlertTriangle, Heart, ShieldAlert, Target, Volume2 } from 'lucide-react'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '../hooks/useApi'
import { useAuthStore } from '../store/authStore'

const SEVERITY_STYLES = {
    critical: { bg: 'bg-ops-red/10', border: 'border-ops-red/30', icon: ShieldAlert, iconColor: 'text-ops-red', dot: 'bg-ops-red' },
    high: { bg: 'bg-ops-amber/10', border: 'border-ops-amber/30', icon: AlertTriangle, iconColor: 'text-ops-amber', dot: 'bg-ops-amber' },
    medium: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Heart, iconColor: 'text-blue-400', dot: 'bg-blue-400' },
    low: { bg: 'bg-ops-green/10', border: 'border-ops-green/30', icon: Check, iconColor: 'text-ops-green', dot: 'bg-ops-green' },
    info: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: Target, iconColor: 'text-purple-400', dot: 'bg-purple-400' },
}

export default function NotificationBell() {
    const { user } = useAuthStore()
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    const { data } = useNotifications()
    const markRead = useMarkNotificationRead()
    const markAllRead = useMarkAllRead()

    const notifications = data?.notifications || []
    const unread = data?.unread_count || 0

    // Only show for employees
    if (user?.role !== 'Employee') return null

    // Close on outside click
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const timeAgo = (date) => {
        if (!date) return ''
        const diff = Date.now() - new Date(date).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins}m ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs}h ago`
        return `${Math.floor(hrs / 24)}d ago`
    }

    return (
        <div className="relative" ref={ref}>
            {/* Bell button */}
            <button
                onClick={() => setOpen(!open)}
                className="relative p-1.5 rounded hover:bg-ops-cyan/10 text-ops-muted hover:text-ops-cyan transition-colors"
            >
                <Bell size={16} />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-ops-red text-white
                           text-[9px] font-mono font-bold flex items-center justify-center animate-pulse">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div className="absolute right-0 top-full mt-2 w-96 max-h-[480px] overflow-hidden
                        bg-ops-navy border border-ops-border rounded-lg shadow-2xl z-50
                        animate-slide-up">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-ops-border/50">
                        <div className="flex items-center gap-2">
                            <Bell size={13} className="text-ops-cyan" />
                            <span className="text-xs font-mono text-ops-muted tracking-wider">NOTIFICATIONS</span>
                            {unread > 0 && (
                                <span className="text-[10px] font-mono text-ops-red bg-ops-red/10 px-1.5 py-0.5 rounded">
                                    {unread} NEW
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {unread > 0 && (
                                <button
                                    onClick={() => markAllRead.mutate()}
                                    className="text-[10px] font-mono text-ops-cyan hover:text-ops-cyan/80 flex items-center gap-1 px-2 py-1 rounded hover:bg-ops-cyan/10 transition-colors"
                                >
                                    <CheckCheck size={11} />
                                    READ ALL
                                </button>
                            )}
                            <button onClick={() => setOpen(false)}
                                className="p-1 rounded hover:bg-white/5 text-ops-muted hover:text-ops-text transition-colors">
                                <X size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Notification list */}
                    <div className="overflow-y-auto max-h-[400px] divide-y divide-ops-border/20">
                        {notifications.length === 0 ? (
                            <div className="px-4 py-10 text-center">
                                <Bell size={24} className="mx-auto text-ops-muted/30 mb-2" />
                                <p className="text-xs font-mono text-ops-muted/50">No notifications yet</p>
                                <p className="text-[10px] text-ops-muted/30 mt-1">
                                    HR interventions will appear here
                                </p>
                            </div>
                        ) : (
                            notifications.map(n => {
                                const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.medium
                                const Icon = style.icon

                                return (
                                    <div
                                        key={n.id}
                                        className={`px-4 py-3 hover:bg-white/3 transition-colors cursor-pointer ${!n.read ? 'bg-ops-cyan/3' : ''}`}
                                        onClick={() => { if (!n.read) markRead.mutate(n.id) }}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Severity icon */}
                                            <div className={`w-8 h-8 rounded-lg ${style.bg} ${style.border} border flex items-center justify-center shrink-0 mt-0.5`}>
                                                <Icon size={14} className={style.iconColor} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                {/* Title + unread dot */}
                                                <div className="flex items-center gap-2">
                                                    {!n.read && <div className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />}
                                                    <span className="text-xs font-mono text-ops-text font-medium truncate">{n.title}</span>
                                                    <span className="text-[10px] font-mono text-ops-muted/50 ml-auto shrink-0">{timeAgo(n.created_at)}</span>
                                                </div>

                                                {/* Message */}
                                                <p className="text-xs text-ops-muted leading-relaxed mt-1">{n.message}</p>

                                                {/* Burnout context */}
                                                {n.context && (
                                                    <div className="flex gap-3 mt-2">
                                                        <span className={`text-[10px] font-mono ${n.context.burnout_score >= 75 ? 'text-ops-red' :
                                                                n.context.burnout_score >= 55 ? 'text-ops-amber' : 'text-ops-green'
                                                            }`}>
                                                            🔥 {n.context.burnout_score?.toFixed(0) || '?'}/100
                                                        </span>
                                                        <span className="text-[10px] font-mono text-ops-muted">
                                                            ⚡ {n.context.efficiency?.toFixed(0) || '?'}%
                                                        </span>
                                                        <span className={`text-[10px] font-mono ${n.context.risk_level === 'CRITICAL' ? 'text-ops-red' :
                                                                n.context.risk_level === 'HIGH' ? 'text-ops-amber' : 'text-ops-muted'
                                                            }`}>
                                                            ⚠️ {n.context.risk_level}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Action chips */}
                                                {n.actions?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {n.actions.slice(0, 3).map((action, i) => (
                                                            <span key={i}
                                                                className="text-[10px] font-mono text-ops-cyan/70 bg-ops-cyan/5 border border-ops-cyan/10 px-2 py-0.5 rounded">
                                                                {action}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-ops-border/50 text-center">
                        <span className="text-[10px] font-mono text-ops-muted/40">
                            💬 SLACK INTEGRATION ACTIVE · REAL-TIME ALERTS
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
