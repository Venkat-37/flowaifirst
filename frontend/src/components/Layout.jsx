import { Link, NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
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
    <div className="min-h-screen bg-[#0B1623] text-[#e2e8f0] flex flex-col" style={{
      backgroundImage: `
        radial-gradient(ellipse at top center, rgba(11,42,60,0.5) 0%, #0B1623 100%),
        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
      `,
      backgroundSize: '100% 100%, 40px 40px, 40px 40px'
    }}>
      {/* Top bar */}
      <header className="border-b border-[rgba(255,255,255,0.04)] bg-[#0B1623]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center gap-6">
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
          <nav className="flex items-center gap-2 flex-1 flex-wrap">
            {visibleNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to} to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-[11px] font-mono font-bold tracking-wider transition-all duration-200 ease ${isActive
                    ? 'bg-[#00e6c3]/15 text-[#00e6c3] border border-[#00e6c3]/40 shadow-[0_0_10px_rgba(0,230,195,0.2)]'
                    : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[rgba(255,255,255,0.05)] border border-transparent'
                  }${to === '/wellness' && !({ isActive: false }).isActive ? ' border border-[#10b981]/20 text-[#10b981]/80 hover:border-[#10b981]/40 hover:text-[#10b981]' : ''}`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}

            {/* Removed redundant Admin link for HR Managers */}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-4 ml-auto">
            <div className="hidden lg:flex items-center gap-2 text-[#10b981]">
              <Wifi size={16} />
              <span className="text-[11px] font-mono tracking-widest leading-none">LIVE</span>
            </div>
            <NotificationBell />
            <Clock />
            <div className="flex items-center gap-3">
              {user?.picture && (
                <img src={user.picture} alt="" className="w-8 h-8 rounded-full border border-[rgba(255,255,255,0.1)]" />
              )}
              <div className="hidden sm:block">
                <p className="text-[13px] font-body text-[#e2e8f0] leading-none mb-[4px]">{user?.name}</p>
                <p className="text-[11px] font-mono text-[#00e6c3] tracking-widest leading-none opacity-80">{user?.role?.toUpperCase()}</p>
              </div>
              <button onClick={handleLogout}
                className="p-2 rounded hover:bg-[#ff4c4c]/10 hover:text-[#ff4c4c] text-[#94a3b8] transition-colors ml-2 duration-200">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="border-b border-[rgba(255,255,255,0.04)] bg-[rgba(11,22,35,0.5)]">
        <div className="max-w-screen-2xl mx-auto px-6 py-2 flex items-center gap-2 text-[11px] font-mono text-[#94a3b8] tracking-widest opacity-80">
          <span>FLOWAI</span>
          <ChevronRight size={12} />
          <span className="text-[#00e6c3]">{user?.role?.toUpperCase()}</span>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-8 animate-fade-in relative z-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-[rgba(255,255,255,0.04)] py-4 text-center relative z-10 bg-[#0B1623]/80 backdrop-blur-sm">
        <span className="text-[11px] font-mono text-[#94a3b8] tracking-widest opacity-50">
          FLOWAI v3.1 · DIGITAL TWIN PLATFORM · PRIVACY-FIRST · CLASSIFIED
        </span>
      </footer>
    </div>
  )
}
