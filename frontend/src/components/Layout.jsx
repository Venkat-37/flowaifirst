import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import {
  LayoutDashboard, Users, Cpu, LogOut, Activity,
  Shield, ChevronRight, Wifi, Heart
} from 'lucide-react'
import { useState, useEffect } from 'react'
import NotificationBell from './NotificationBell'

const NAV = [
  { to: '/dashboard', label: 'COMMAND CENTER', icon: LayoutDashboard, roles: ['HR Manager', 'Department Head'] },
  { to: '/explorer', label: 'PERSONNEL', icon: Users, roles: ['HR Manager', 'Department Head'] },
  { to: '/twin', label: 'TWIN MIRROR', icon: Cpu, roles: ['HR Manager', 'Department Head', 'Employee'] },
  { to: '/employee', label: 'MY PROFILE', icon: Activity, roles: ['Employee'] },
  { to: '/wellness', label: 'WELLNESS', icon: Heart, roles: ['HR Manager', 'Department Head', 'Employee'] },
]

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="font-mono text-ops-cyan text-xs">
      {time.toUTCString().replace('GMT', 'UTC')}
    </span>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visibleNav = NAV.filter(n => n.roles.includes(user?.role))

  return (
    <div className="min-h-screen bg-ops-black grid-bg flex flex-col">
      {/* Top bar */}
      <header className="border-b border-ops-border bg-ops-navy/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-4">
            <div className="w-7 h-7 border-2 border-ops-cyan rounded flex items-center justify-center"
              style={{ boxShadow: '0 0 12px rgba(0,180,216,0.6)' }}>
              <Shield size={14} className="text-ops-cyan" />
            </div>
            <span className="font-display text-base font-bold text-ops-cyan tracking-widest"
              style={{ textShadow: '0 0 16px rgba(0,180,216,0.6)' }}>
              FLOWAI
            </span>
            <span className="text-ops-muted text-xs font-mono ml-1 hidden sm:inline">v3.1</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1 flex-1 flex-wrap">
            {visibleNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to} to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body font-medium tracking-wider transition-all duration-200 ${isActive
                    ? 'bg-ops-cyan/15 text-ops-cyan border border-ops-cyan/40'
                    : 'text-ops-muted hover:text-ops-text hover:bg-white/5'
                  }${to === '/wellness' && !({ isActive: false }).isActive ? ' border border-ops-green/20 text-ops-green/70 hover:border-ops-green/40 hover:text-ops-green' : ''}`
                }
              >
                <Icon size={13} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-4 ml-auto">
            <div className="hidden lg:flex items-center gap-1.5 text-ops-green">
              <Wifi size={12} />
              <span className="text-xs font-mono">LIVE</span>
            </div>
            <NotificationBell />
            <Clock />
            <div className="flex items-center gap-2">
              {user?.picture && (
                <img src={user.picture} alt="" className="w-7 h-7 rounded-full border border-ops-border" />
              )}
              <div className="hidden sm:block">
                <p className="text-xs font-body text-ops-text leading-none">{user?.name}</p>
                <p className="text-xs font-mono text-ops-cyan leading-none mt-0.5">{user?.role}</p>
              </div>
              <button onClick={handleLogout}
                className="p-1.5 rounded hover:bg-ops-red/10 hover:text-ops-red text-ops-muted transition-colors ml-1">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="border-b border-ops-border/50 bg-ops-black/50">
        <div className="max-w-screen-2xl mx-auto px-4 py-1.5 flex items-center gap-1 text-xs font-mono text-ops-muted">
          <span>FLOWAI</span>
          <ChevronRight size={10} />
          <span className="text-ops-cyan">{user?.role?.toUpperCase()}</span>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6 animate-fade-in">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-ops-border/30 py-2 text-center">
        <span className="text-xs font-mono text-ops-muted/50">
          FLOWAI v3.1 · DIGITAL TWIN PLATFORM · PRIVACY-FIRST · CLASSIFIED
        </span>
      </footer>
    </div>
  )
}
