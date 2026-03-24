import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Shield, Zap, AlertCircle, Loader2, User } from 'lucide-react'

export default function Login() {
  const { loginWithPassword, user, loading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [empId, setEmpId] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (user) {
      const role = user.role
      if (role === 'admin' || role === 'sys_admin') navigate('/admin', { replace: true })
      else if (role === 'Employee' || role === 'employee') navigate('/employee', { replace: true })
      else if (role === 'HR Manager' || role === 'hr_manager' || role === 'Department Head') navigate('/dashboard', { replace: true })
      else navigate('/', { replace: true })
    }
  }, [user])

  const handlePasswordLogin = async (usr, pwd) => {
    clearError()
    const uId = usr || adminUsername
    const uPwd = pwd || password
    if (!uId.trim() || !uPwd.trim()) return
    try {
      const u = await loginWithPassword(uId.trim(), uPwd.trim())
      const role = u.role
      if (role === 'admin' || role === 'sys_admin') navigate('/admin', { replace: true })
      else if (role === 'Employee' || role === 'employee') navigate('/employee', { replace: true })
      else if (role === 'HR Manager' || role === 'hr_manager' || role === 'Department Head') navigate('/dashboard', { replace: true })
      else navigate('/', { replace: true })
    } catch { /* error shown via store */ }
  }

  return (
    <div className="min-h-screen bg-ops-black grid-bg flex items-center justify-center relative overflow-hidden">
      {/* Radar sweep */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[700px] h-[700px] border border-ops-cyan/5 rounded-full" />
        <div className="absolute w-[500px] h-[500px] border border-ops-cyan/5 rounded-full" />
        <div className="absolute w-[300px] h-[300px] border border-ops-cyan/8 rounded-full" />
        <div className="absolute w-[150px] h-[150px] border border-ops-cyan/10 rounded-full" />
        {/* Sweep line */}
        <div className="absolute w-[350px] h-[1px] origin-left"
          style={{
            background: 'linear-gradient(to right, rgba(0,180,216,0.8), transparent)',
            top: '50%',
            left: '50%',
            animation: 'spin 6s linear infinite',
          }} />
      </div>

      {/* Scanline */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-ops-cyan/20 to-transparent animate-scan" />
      </div>

      {/* Main card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="ops-card p-8 shadow-cyan-glow">
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 border-2 border-ops-cyan rounded-lg flex items-center justify-center mb-4"
              style={{ boxShadow: '0 0 30px rgba(0,180,216,0.5), inset 0 0 30px rgba(0,180,216,0.05)' }}>
              <Shield size={28} className="text-ops-cyan" />
            </div>
            <h1 className="font-display text-3xl font-bold text-ops-cyan tracking-widest"
              style={{ textShadow: '0 0 24px rgba(0,180,216,0.6)' }}>
              FLOWAI
            </h1>
            <p className="text-ops-muted text-xs font-mono tracking-widest mt-1">
              ENTERPRISE DIGITAL TWIN PLATFORM
            </p>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 bg-ops-green/10 border border-ops-green/30 rounded px-3 py-2 mb-6">
            <div className="w-2 h-2 rounded-full bg-ops-green animate-pulse" />
            <span className="text-xs font-mono text-ops-green tracking-wider">SYSTEMS OPERATIONAL</span>
            <span className="text-xs font-mono text-ops-muted ml-auto">300 TWINS ACTIVE</span>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-ops-red/10 border border-ops-red/30 rounded px-3 py-2 mb-4">
              <AlertCircle size={13} className="text-ops-red mt-0.5 shrink-0" />
              <span className="text-xs text-ops-red font-mono">{error}</span>
            </div>
          )}

          {/* HR / Admin Sign in */}
          <div className="mb-3 space-y-3">
            <p className="text-[10px] font-mono text-ops-muted tracking-wider mb-2 uppercase">Personnel Access</p>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ops-muted" />
              <input
                type="text"
                value={adminUsername}
                onChange={e => setAdminUsername(e.target.value)}
                placeholder="USERNAME (hr / admin)"
                className="w-full py-3.5 pl-9 pr-3 rounded-lg border bg-ops-navy/50 border-ops-border/50
                           text-ops-text text-sm font-mono placeholder:text-ops-muted/40
                           focus:border-ops-cyan/50 focus:outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <Shield size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ops-muted" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()}
                placeholder="PASSWORD"
                className="w-full py-3.5 pl-9 pr-3 rounded-lg border bg-ops-navy/50 border-ops-border/50
                           text-ops-text text-sm font-mono placeholder:text-ops-muted/40
                           focus:border-ops-cyan/50 focus:outline-none transition-colors"
              />
            </div>
            <button
              onClick={() => handlePasswordLogin()}
              disabled={loading || !adminUsername.trim() || !password.trim()}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-lg border
                         bg-ops-cyan/10 border-ops-cyan/30 text-ops-cyan font-mono font-bold text-sm tracking-widest
                         hover:bg-ops-cyan/20 hover:border-ops-cyan/40 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin text-ops-cyan" />
              ) : (
                'SECURE LOGIN'
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-ops-border/50" />
            <span className="text-[10px] font-mono text-ops-muted tracking-wider">EMPLOYEE RAPID ACCESS</span>
            <div className="flex-1 h-px bg-ops-border/50" />
          </div>

          {/* Employee Login */}
          <div>
            <div className="flex gap-2 mb-3">
              <div className="flex-1 relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ops-muted" />
                <input
                  type="text"
                  value={empId}
                  onChange={e => setEmpId(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handlePasswordLogin(empId, 'emp123')}
                  placeholder="EMP001"
                  className="w-full py-3 pl-9 pr-3 rounded-lg border bg-ops-navy/50 border-ops-border/50
                             text-ops-text text-sm font-mono placeholder:text-ops-muted/40
                             focus:border-ops-cyan/50 focus:outline-none transition-colors"
                />
              </div>
              <button
                onClick={() => handlePasswordLogin(empId, 'emp123')}
                disabled={loading || !empId.trim()}
                className="px-5 py-3 rounded-lg border bg-ops-cyan/10 border-ops-cyan/30 text-ops-cyan
                           text-xs font-mono tracking-wider hover:bg-ops-cyan/20 transition-all
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : 'LOGIN'}
              </button>
            </div>

            {/* Quick select employees */}
            <div className="flex gap-2">
              {['EMP001', 'EMP101', 'EMP203'].map(id => (
                <button
                  key={id}
                  onClick={() => handlePasswordLogin(id, 'emp123')}
                  disabled={loading}
                  className="flex-1 py-2 rounded border bg-ops-navy/30 border-ops-border/30
                             text-[11px] font-mono text-ops-muted hover:text-ops-cyan hover:border-ops-cyan/30
                             transition-all disabled:opacity-50"
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-ops-border/50">
            <div className="flex items-start gap-2">
              <Zap size={12} className="text-ops-cyan mt-0.5 shrink-0" />
              <p className="text-xs text-ops-muted font-body leading-relaxed">
                Authorized personnel authenticate via secure password credentials.
                Employees can log in with their Employee ID for quick access to their digital twin.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs font-mono text-ops-muted/40 mt-4">
          CLASSIFIED · AUTHORIZED PERSONNEL ONLY
        </p>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
