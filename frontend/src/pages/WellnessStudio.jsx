import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import FeedbackButton from '../components/FeedbackButton'
import {
  Heart, Wind, Timer, Target, TrendingUp, BarChart2,
  CheckSquare, Brain, Zap, Moon, Sun, RefreshCw, Plus, X, Flame, Search
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''

// ── Breathing patterns ──────────────────────────────────────────────────────
const BREATH_MODES = {
  box: { label: 'Box (4-4-4-4)', phases: ['Inhale', 'Hold', 'Exhale', 'Hold'], durations: [4, 4, 4, 4] },
  '478': { label: '4-7-8 Relax', phases: ['Inhale', 'Hold', 'Exhale'], durations: [4, 7, 8] },
  calm: { label: 'Calm (4-6)', phases: ['Inhale', 'Exhale'], durations: [4, 6] },
}

const MOOD_OPTIONS = [
  { v: 1, emoji: '😔', label: 'Rough' },
  { v: 2, emoji: '😕', label: 'Low' },
  { v: 3, emoji: '😐', label: 'Okay' },
  { v: 4, emoji: '😊', label: 'Good' },
  { v: 5, emoji: '🌟', label: 'Great' },
]

const POMO_MODES = [
  { id: 'work', label: 'Focus · 25m', mins: 25, color: '#10b981' },
  { id: 'short_break', label: 'Break · 5m', mins: 5, color: '#00b4d8' },
  { id: 'long_break', label: 'Long · 15m', mins: 15, color: '#f59e0b' },
]

const RISK_COLOR = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#dc2626' }

// ── Wellness ring canvas ────────────────────────────────────────────────────
function WellnessRing({ score = 75, size = 120 }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = size / 2, cy = size / 2, r = size / 2 - 10
    const color = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : '#dc2626'
    ctx.clearRect(0, 0, size, size)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 8; ctx.stroke()
    const end = -Math.PI / 2 + (score / 100) * Math.PI * 2
    const g = ctx.createLinearGradient(0, 0, size, size)
    g.addColorStop(0, color + '88'); g.addColorStop(1, color)
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, end)
    ctx.strokeStyle = g; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke()
  }, [score, size])
  return <canvas ref={ref} width={size} height={size} />
}

// ── Breathing canvas ────────────────────────────────────────────────────────
function BreathCanvas({ phase, t }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = 98, cy = 98
    ctx.clearRect(0, 0, 196, 196)
    const minR = 36, maxR = 78
    const r = minR + (maxR - minR) * t
    for (let i = 3; i >= 1; i--) {
      ctx.beginPath(); ctx.arc(cx, cy, r + i * 11, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0,180,216,${(0.03 + t * 0.08) / i})`
      ctx.lineWidth = 1; ctx.stroke()
    }
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    gr.addColorStop(0, `rgba(0,180,216,${0.07 + t * 0.15})`)
    gr.addColorStop(1, `rgba(0,77,128,${0.04 + t * 0.08})`)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = gr; ctx.fill()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(0,180,216,${0.3 + t * 0.5})`
    ctx.lineWidth = 2; ctx.stroke()
  }, [t])
  return <canvas ref={ref} width={196} height={196} className="absolute top-0 left-0" />
}

// ── Pomodoro ring canvas ────────────────────────────────────────────────────
function PomoCanvas({ frac, color }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = 88, cy = 88, r = 70
    ctx.clearRect(0, 0, 176, 176)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 9; ctx.stroke()
    if (frac > 0) {
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
      ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(cx, cy, r + 15, 0, Math.PI * 2)
    ctx.strokeStyle = color + '14'; ctx.lineWidth = 1; ctx.stroke()
  }, [frac, color])
  return <canvas ref={ref} width={176} height={176} className="absolute top-0 left-0" />
}

// ── Section header ──────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, iconColor = 'text-ops-cyan', title, sub }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 bg-ops-card border border-ops-border/60 rounded-xl flex items-center justify-center shrink-0">
        <Icon size={17} className={iconColor} />
      </div>
      <div>
        <p className="text-sm font-body font-semibold text-ops-text">{title}</p>
        {sub && <p className="text-xs text-ops-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Toast ───────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)
  const show = useCallback((m) => {
    setMsg(m); setVisible(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), 3200)
  }, [])
  return { msg, visible, show }
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function WellnessStudio() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Resolve emp_id: URL param first (?id=EMP203), then user profile
  const urlEmpId = params.get('id')?.toUpperCase() || ''
  const userEmpId = user?.emp_id || ''
  const [empPickerInput, setEmpPickerInput] = useState(urlEmpId || userEmpId)
  const [empId, setEmpId] = useState(urlEmpId || userEmpId)
  const { msg: toastMsg, visible: toastVisible, show: showToast } = useToast()
  const needsPicker = !urlEmpId && !userEmpId  // HR user without emp_id and no URL param

  // Wellness data
  const [wellness, setWellness] = useState(null)
  const [plan, setPlan] = useState(null)
  const [moodHistory, setMoodHistory] = useState([])
  const [todayMood, setTodayMood] = useState(null)
  const [goals, setGoals] = useState([])
  const [weekStart, setWeekStart] = useState('')
  const [activityStats, setActivity] = useState(null)
  const [loading, setLoading] = useState(true)

  // Mood check-in
  const [selectedMood, setSelectedMood] = useState(0)
  const [energyLevel, setEnergyLevel] = useState(3)
  const [moodNote, setMoodNote] = useState('')
  const [goalInput, setGoalInput] = useState('')
  const [focusMins, setFocusMins] = useState(0)

  // Breathing
  const [breathMode, setBreathMode] = useState('box')
  const [breathRunning, setBreathRunning] = useState(false)
  const [breathPhase, setBreathPhase] = useState('Ready')
  const [breathCount, setBreathCount] = useState(0)
  const [breathT, setBreathT] = useState(0)
  const [breathCycles, setBreathCycles] = useState(0)
  const breathRef = useRef({ running: false, phaseIdx: 0, cycles: 0, raf: null })

  // Pomodoro
  const [pomoModeIdx, setPomoModeIdx] = useState(0)
  const [pomoRemaining, setPomoRemaining] = useState(25 * 60)
  const [pomoRunning, setPomoRunning] = useState(false)
  const pomoInterval = useRef(null)

  const pomoMode = POMO_MODES[pomoModeIdx]
  const pomoDuration = pomoMode.mins * 60
  const pomoFrac = pomoRemaining / pomoDuration

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!empId) return
    loadAll()
  }, [empId])

  async function loadAll() {
    setLoading(true)
    try {
      const [wellRes, planRes, moodRes, goalsRes, statsRes, pomoRes] = await Promise.allSettled([
        axios.get(`${API}/api/wellness/employee/${empId}`).then(r => r.data),
        axios.get(`${API}/api/wellness/plan/${empId}`).then(r => r.data),
        axios.get(`${API}/api/wellness/mood/${empId}`).then(r => r.data),
        axios.get(`${API}/api/wellness/goals/${empId}`).then(r => r.data),
        axios.get(`${API}/api/wellness/stats/${empId}`).then(r => r.data),
        axios.get(`${API}/api/wellness/pomodoro/${empId}/today`).then(r => r.data),
      ])
      if (wellRes.status === 'fulfilled') setWellness(wellRes.value)
      if (planRes.status === 'fulfilled') setPlan(planRes.value)
      if (moodRes.status === 'fulfilled') {
        const md = moodRes.value
        setMoodHistory(md.history || [])
        if (md.today) {
          setTodayMood(md.today)
          setSelectedMood(md.today.mood_score)
          setEnergyLevel(md.today.energy_score)
          setMoodNote(md.today.note || '')
        }
      }
      if (goalsRes.status === 'fulfilled') {
        setGoals(goalsRes.value.goals || [])
        setWeekStart(goalsRes.value.week_start || '')
      }
      if (statsRes.status === 'fulfilled') setActivity(statsRes.value)
      if (pomoRes.status === 'fulfilled') setFocusMins(pomoRes.value.focus_minutes_today || 0)
    } catch (e) {
      showToast('Could not load wellness data')
    }
    setLoading(false)
  }

  // ── Mood submit ───────────────────────────────────────────────────────────
  async function submitMood() {
    if (!selectedMood) { showToast('Please pick a mood first'); return }
    try {
      await axios.post(`${API}/api/wellness/mood`, {
        emp_id: empId, mood_score: selectedMood, energy_score: energyLevel, note: moodNote,
      })
      showToast('Check-in saved ✓')
      const md = await axios.get(`${API}/api/wellness/mood/${empId}`).then(r => r.data)
      setMoodHistory(md.history || [])
      setTodayMood(md.today)
    } catch { showToast('Could not save — is the server running?') }
  }

  // ── Goals ─────────────────────────────────────────────────────────────────
  async function addGoal() {
    const text = goalInput.trim()
    if (!text) return
    if (goals.length >= 3) { showToast('Maximum 3 goals per week'); return }
    try {
      const res = await axios.post(`${API}/api/wellness/goal`, { emp_id: empId, goal_text: text })
      if (res.data.status === 'limit_reached') { showToast('Max 3 goals per week'); return }
      setGoalInput('')
      const fresh = await axios.get(`${API}/api/wellness/goals/${empId}`).then(r => r.data)
      setGoals(fresh.goals || [])
      showToast('Goal added. You can do it.')
    } catch { showToast('Could not save goal') }
  }

  async function toggleGoal(id, completed) {
    await axios.post(`${API}/api/wellness/goal`, { emp_id: empId, goal_id: id, completed })
    const fresh = await axios.get(`${API}/api/wellness/goals/${empId}`).then(r => r.data)
    setGoals(fresh.goals || [])
    if (completed) showToast('Goal complete! Well done.')
  }

  // ── Breathing ─────────────────────────────────────────────────────────────
  function stopBreath() {
    breathRef.current.running = false
    cancelAnimationFrame(breathRef.current.raf)
    setBreathRunning(false)
    setBreathPhase('Ready')
    setBreathCount(0)
    setBreathT(0)
  }

  function startBreath() {
    breathRef.current.running = true
    breathRef.current.phaseIdx = 0
    setBreathRunning(true)
    runBreathPhase()
  }

  function runBreathPhase() {
    const ref = breathRef.current
    if (!ref.running) return
    const mode = BREATH_MODES[breathMode]
    const phase = mode.phases[ref.phaseIdx]
    const dur = mode.durations[ref.phaseIdx] * 1000
    const start = performance.now()

    setBreathPhase(phase)

    function tick(now) {
      if (!ref.running) return
      const elapsed = now - start
      const progress = Math.min(elapsed / dur, 1)
      const secsLeft = Math.ceil((dur - elapsed) / 1000)
      setBreathCount(secsLeft)
      const sz = phase === 'Inhale' ? progress
        : phase === 'Exhale' ? 1 - progress
          : ref.phaseIdx === 1 ? 1 : 0
      setBreathT(sz)
      if (progress < 1) {
        ref.raf = requestAnimationFrame(tick)
      } else {
        ref.phaseIdx = (ref.phaseIdx + 1) % mode.phases.length
        if (ref.phaseIdx === 0) {
          ref.cycles++
          setBreathCycles(ref.cycles)
        }
        if (ref.running) setTimeout(runBreathPhase, 40)
      }
    }
    ref.raf = requestAnimationFrame(tick)
  }

  function resetBreath() {
    stopBreath()
    breathRef.current.phaseIdx = 0
    breathRef.current.cycles = 0
    setBreathCycles(0)
  }

  // ── Pomodoro ──────────────────────────────────────────────────────────────
  function changePomoMode(idx) {
    if (pomoRunning) { clearInterval(pomoInterval.current); setPomoRunning(false) }
    setPomoModeIdx(idx)
    setPomoRemaining(POMO_MODES[idx].mins * 60)
  }

  function togglePomo() {
    if (pomoRunning) {
      clearInterval(pomoInterval.current)
      setPomoRunning(false)
    } else {
      setPomoRunning(true)
      pomoInterval.current = setInterval(() => {
        setPomoRemaining(prev => {
          if (prev <= 1) {
            clearInterval(pomoInterval.current)
            setPomoRunning(false)
            onPomoComplete()
            return POMO_MODES[pomoModeIdx].mins * 60
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  async function onPomoComplete() {
    const mins = POMO_MODES[pomoModeIdx].mins
    showToast(pomoModeIdx === 0 ? `${mins}-min focus session complete! 🎯` : 'Break done — back to work')
    if (pomoModeIdx === 0) {
      try {
        const res = await axios.post(`${API}/api/wellness/pomodoro`, {
          emp_id: empId, duration_min: mins, session_type: 'work',
        })
        setFocusMins(res.data.focus_minutes_today || focusMins + mins)
      } catch { }
    }
  }

  const pomoMm = Math.floor(pomoRemaining / 60)
  const pomoSs = pomoRemaining % 60
  const pomoDisplay = `${pomoMm < 10 ? '0' : ''}${pomoMm}:${pomoSs < 10 ? '0' : ''}${pomoSs}`

  // ── Helpers ───────────────────────────────────────────────────────────────
  const wellnessScore = wellness?.wellness_score ?? 75
  const wellnessColor = wellnessScore >= 70 ? '#10b981' : wellnessScore >= 45 ? '#f59e0b' : '#dc2626'

  const chartData = moodHistory.map(h => {
    const parts = h.log_date.split('-')
    return { date: `${parts[1]}/${parts[2]}`, mood: h.mood_score, energy: h.energy_score }
  })

  const moodTrend = moodHistory.length >= 3
    ? moodHistory[moodHistory.length - 1].mood_score - moodHistory[0].mood_score
    : 0
  const trendLabel = moodTrend > 0 ? 'improving ↑' : moodTrend < 0 ? 'declining ↓' : 'stable →'
  const trendColor = moodTrend > 0 ? 'text-ops-green' : moodTrend < 0 ? 'text-ops-red' : 'text-ops-muted'

  const catColors = {
    'Productive': '#10b981', 'Productive (Contextual)': '#00b4d8',
    'Neutral': '#64748b', 'Distraction': '#dc2626',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-slide-up">

      {/* Toast */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-50 bg-ops-navy border border-ops-cyan text-ops-text
                        px-4 py-3 rounded-xl text-sm font-body shadow-cyan-glow animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* Employee picker for HR users */}
      {needsPicker && (
        <div className="ops-card p-4 flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-ops-muted tracking-widest">VIEW EMPLOYEE:</span>
          <input
            className="ops-input w-36 font-mono uppercase"
            placeholder="EMP001"
            value={empPickerInput}
            onChange={e => setEmpPickerInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && empPickerInput && setEmpId(empPickerInput.trim().toUpperCase())}
          />
          <button onClick={() => empPickerInput && setEmpId(empPickerInput.trim().toUpperCase())}
            className="ops-btn flex items-center gap-1.5 text-xs">
            <Search size={13} /> LOAD
          </button>
          {empId && (
            <span className="font-mono text-xs text-ops-cyan border border-ops-cyan/30 px-2 py-1 rounded-full">
              Active: {empId}
            </span>
          )}
        </div>
      )}
      {/* ── Hero ── */}
      <div className="ops-card p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative">
            <WellnessRing score={wellnessScore} size={120} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-display text-2xl font-bold" style={{ color: wellnessColor }}>
                {loading ? '—' : wellnessScore}
              </span>
              <span className="text-xs font-mono text-ops-muted tracking-widest">WELLNESS</span>
            </div>
          </div>
        </div>
        <div className="flex-1">
          <div className="inline-block font-mono text-xs tracking-widest text-ops-cyan
                          border border-ops-cyan/30 px-3 py-1 rounded-full mb-3">
            ✦ YOUR PERSONAL WELLNESS SPACE
          </div>
          <h1 className="font-display text-2xl font-bold text-ops-cyan tracking-widest mb-1">
            WELLNESS STUDIO
          </h1>
          <p className="text-sm text-ops-muted font-body leading-relaxed max-w-lg">
            This space is for you, not for HR. Mood logs are private. Use the tools to build
            sustainable energy — not just get through the sprint.
          </p>
        </div>
        {plan && (
          <div className="grid grid-cols-2 gap-3 shrink-0">
            {[
              { val: plan.hr_stress != null ? plan.hr_stress + '/10' : '—', label: 'Stress', color: plan.hr_stress >= 7 ? '#dc2626' : '#10b981' },
              { val: plan.hr_wlb != null ? plan.hr_wlb + '/10' : '—', label: 'Work-Life Balance', color: plan.hr_wlb <= 4 ? '#dc2626' : '#10b981' },
              { val: plan.hr_hours != null ? plan.hr_hours + 'h' : '—', label: 'Hours/Week', color: '#f59e0b' },
              { val: plan.hr_wfh != null ? plan.hr_wfh + ' d' : '—', label: 'WFH Days', color: '#00b4d8' },
            ].map(s => (
              <div key={s.label} className="ops-card p-3 text-center min-w-[80px]">
                <p className="font-display text-xl font-bold" style={{ color: s.color }}>{s.val}</p>
                <p className="font-mono text-xs text-ops-muted tracking-widest mt-0.5">{s.label.toUpperCase()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Mood Check-in ── */}
      <div className="ops-card p-5">
        <SectionHead icon={Heart} iconColor="text-ops-red" title="Daily Check-in"
          sub="20 seconds. Helps you spot patterns you would never notice otherwise." />

        {todayMood && (
          <div className="flex items-center gap-3 bg-ops-green/10 border border-ops-green/30 rounded-xl p-3 mb-4">
            <span className="text-2xl">{MOOD_OPTIONS.find(m => m.v === todayMood.mood_score)?.emoji}</span>
            <div>
              <p className="text-sm font-body font-semibold text-ops-green">
                Checked in: {MOOD_OPTIONS.find(m => m.v === todayMood.mood_score)?.label}
              </p>
              <p className="text-xs text-ops-muted mt-0.5">
                Energy {todayMood.energy_score}/5{todayMood.note ? ` — ${todayMood.note}` : ''} · Tap to update
              </p>
            </div>
          </div>
        )}

        <p className="text-xs text-ops-muted mb-3">How is your mood right now?</p>
        <div className="flex justify-center gap-3 mb-4 flex-wrap">
          {MOOD_OPTIONS.map(({ v, emoji, label }) => (
            <button key={v} onClick={() => setSelectedMood(v)}
              className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all ${selectedMood === v
                ? 'bg-ops-cyan/10 border-ops-cyan'
                : 'bg-white/3 border-transparent hover:bg-ops-cyan/5 hover:border-ops-cyan/30'
                }`}>
              <span className="text-2xl">{emoji}</span>
              <span className="text-xs font-mono text-ops-muted tracking-wider">{label.toUpperCase()}</span>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-ops-muted mb-2">
            <span>Energy Level</span>
            <span className="font-mono">{energyLevel} / 5</span>
          </div>
          <input type="range" min={1} max={5} value={energyLevel}
            onChange={e => setEnergyLevel(Number(e.target.value))}
            className="w-full h-1.5 rounded-full accent-ops-cyan bg-ops-border cursor-pointer" />
        </div>

        <textarea value={moodNote} onChange={e => setMoodNote(e.target.value)} rows={2}
          placeholder="Optional: anything on your mind? (only you can see this)"
          className="w-full bg-white/3 border border-ops-border rounded-xl text-ops-text p-3
                     text-sm font-body resize-none outline-none mb-3
                     focus:border-ops-cyan transition-colors placeholder:text-ops-muted/50" />

        <div className="flex items-center justify-between">
          <button onClick={submitMood} className="ops-btn flex items-center gap-2">
            <Heart size={14} /> Save Check-in
          </button>
          <span className="text-xs font-mono text-ops-muted/60">Private — HR cannot see mood logs</span>
        </div>
      </div>

      {/* ── Breathe + Pomodoro ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Breathing */}
        <div className="ops-card p-5">
          <SectionHead icon={Wind} iconColor="text-ops-cyan" title="Guided Breathing"
            sub="Box breathing lowers cortisol in under 4 minutes." />

          <div className="flex gap-2 mb-4 flex-wrap">
            {Object.entries(BREATH_MODES).map(([key, m]) => (
              <button key={key} onClick={() => { resetBreath(); setBreathMode(key) }}
                className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${breathMode === key
                  ? 'bg-ops-cyan/15 border-ops-cyan text-ops-cyan'
                  : 'border-ops-border text-ops-muted hover:border-ops-cyan/40 hover:text-ops-text'
                  }`}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center">
            <div className="relative w-[196px] h-[196px] mb-4">
              <BreathCanvas phase={breathPhase} t={breathT} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-display text-lg text-ops-text">{breathPhase}</span>
                <span className="font-mono text-3xl font-bold text-ops-cyan mt-1">
                  {breathRunning ? breathCount : '—'}
                </span>
                <span className="font-mono text-xs text-ops-muted tracking-widest mt-1">
                  {breathRunning ? breathPhase.toUpperCase() : 'PRESS START'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <button onClick={() => breathRunning ? stopBreath() : startBreath()}
                className={`ops-btn flex items-center gap-2 ${breathRunning ? 'opacity-90' : ''}`}>
                {breathRunning ? '⏸ Pause' : '▶ Start'}
              </button>
              <button onClick={resetBreath}
                className="px-4 py-2 rounded-xl text-sm border border-ops-red/30 text-ops-red
                           bg-ops-red/5 hover:bg-ops-red/10 transition-colors">
                Reset
              </button>
            </div>
            <p className="font-mono text-xs text-ops-muted tracking-widest uppercase">
              Cycles completed: {breathCycles}
            </p>
          </div>
        </div>

        {/* Pomodoro */}
        <div className="ops-card p-5">
          <SectionHead icon={Timer} iconColor="text-ops-amber" title="Focus Timer"
            sub="Pomodoro builds real deep work capacity over time." />

          <div className="flex bg-ops-black/50 border border-ops-border rounded-xl p-1 mb-4">
            {POMO_MODES.map((m, i) => (
              <button key={m.id} onClick={() => changePomoMode(i)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-all ${pomoModeIdx === i
                  ? 'text-ops-text'
                  : 'text-ops-muted hover:text-ops-text'
                  }`}
                style={pomoModeIdx === i ? { background: m.color + '22', color: m.color } : {}}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center">
            <div className="relative w-[176px] h-[176px] mb-4">
              <PomoCanvas frac={pomoFrac} color={pomoMode.color} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-3xl font-bold text-ops-text tracking-tight">
                  {pomoDisplay}
                </span>
                <span className="font-mono text-xs text-ops-muted tracking-widest mt-1">
                  {pomoModeIdx === 0 ? 'FOCUS' : pomoModeIdx === 1 ? 'SHORT BREAK' : 'LONG BREAK'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <button onClick={togglePomo} className="ops-btn flex items-center gap-2">
                {pomoRunning ? '⏸ Pause' : '▶ Start'}
              </button>
              <button onClick={() => { clearInterval(pomoInterval.current); setPomoRunning(false); setPomoRemaining(pomoMode.mins * 60) }}
                className="px-4 py-2 rounded-xl text-sm border border-ops-border text-ops-muted
                           bg-white/3 hover:bg-white/5 transition-colors">
                ↺ Reset
              </button>
            </div>
            <p className="font-mono text-xs text-ops-muted uppercase tracking-widest">
              Today: <span className="text-ops-amber">{focusMins}</span> focus minutes
            </p>
          </div>
        </div>
      </div>

      {/* ── Personalised Plan ── */}
      <div className="ops-card p-5">
        <SectionHead icon={Zap} iconColor="text-ops-purple" title="Your Plan for Today"
          sub="Generated from your actual digital twin data — not a generic list." />
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-36 bg-ops-border/20 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !plan?.actions?.length ? (
          <p className="text-sm text-ops-muted font-body italic text-center py-6">
            No plan yet — log some activity to generate personalised recommendations.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plan.actions.map((a, i) => {
              const planSid = `plan-${empId}-${i}-${btoa(encodeURIComponent(a.title.slice(0, 20))).replace(/[^a-z0-9]/gi, '').slice(0, 16)}`
              return (
                <div key={i} className={`ops-card p-4 relative overflow-hidden border-l-2 group ${a.priority === 'high' ? 'border-l-ops-red' :
                  a.priority === 'medium' ? 'border-l-ops-amber' : 'border-l-ops-green'
                  }`}>
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-xl">{a.icon}</span>
                    <div className="flex-1">
                      <p className="font-mono text-xs text-ops-muted tracking-widest mb-0.5">
                        {a.category.toUpperCase()}
                      </p>
                      <p className="text-sm font-body font-semibold text-ops-text">{a.title}</p>
                    </div>
                  </div>
                  <p className="text-xs text-ops-muted font-body leading-relaxed">{a.body}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${a.priority === 'high' ? 'bg-ops-red/15 text-ops-red' :
                      a.priority === 'medium' ? 'bg-ops-amber/15 text-ops-amber' : 'bg-ops-green/15 text-ops-green'
                      }`}>
                      {a.priority.toUpperCase()}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <FeedbackButton
                        suggestionType="plan_action"
                        suggestionId={planSid}
                        suggestionText={a.title + ' — ' + a.body}
                        context={{ emp_id: empId, category: a.category, priority: a.priority }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Mood History + Goals ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Mood chart */}
        <div className="ops-card p-5">
          <SectionHead icon={TrendingUp} iconColor="text-ops-green" title="Mood History"
            sub="14-day view of mood and energy patterns." />
          {chartData.length === 0 ? (
            <p className="text-sm text-ops-muted italic text-center py-8">
              Log your mood daily to see patterns here.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'Share Tech Mono' }} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                    tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'Share Tech Mono' }} />
                  <Tooltip
                    contentStyle={{ background: '#0d1b2e', border: '1px solid #1e4068', borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                  <Line type="monotone" dataKey="mood" stroke="#10b981" strokeWidth={2}
                    dot={{ r: 3, fill: '#10b981' }} />
                  <Line type="monotone" dataKey="energy" stroke="#f59e0b" strokeWidth={2}
                    strokeDasharray="4 3" dot={{ r: 2, fill: '#f59e0b' }} />
                </LineChart>
              </ResponsiveContainer>
              {moodHistory.length >= 2 && (
                <p className={`text-xs font-mono mt-2 text-center ${trendColor}`}>
                  Avg mood {(moodHistory.reduce((a, h) => a + h.mood_score, 0) / moodHistory.length).toFixed(1)}/5
                  &nbsp;·&nbsp;trend: {trendLabel} over {moodHistory.length} days
                </p>
              )}
            </>
          )}
        </div>

        {/* Weekly goals */}
        <div className="ops-card p-5">
          <SectionHead icon={Target} iconColor="text-ops-purple" title="Weekly Commitments"
            sub="Up to 3 small goals you own this week." />

          {weekStart && (
            <p className="font-mono text-xs text-ops-muted tracking-widest mb-3">
              WEEK OF {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
            </p>
          )}

          {goals.length === 0 ? (
            <p className="text-sm italic text-ops-muted text-center py-4 font-body">
              No goals yet this week. Add one below.
            </p>
          ) : (
            <div className="divide-y divide-ops-border/20 mb-3">
              {goals.map(g => (
                <div key={g.id} className="flex items-center gap-3 py-2.5">
                  <button onClick={() => toggleGoal(g.id, !g.completed)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${g.completed ? 'bg-ops-green border-ops-green' : 'border-ops-cyan/40 hover:border-ops-cyan'
                      }`}>
                    {g.completed && <span className="text-ops-black text-xs font-bold">✓</span>}
                  </button>
                  <span className={`flex-1 text-sm font-body ${g.completed ? 'line-through text-ops-muted' : 'text-ops-text'}`}>
                    {g.goal_text}
                  </span>
                  <button onClick={() => setGoals(goals.filter(x => x.id !== g.id))}
                    className="text-ops-muted hover:text-ops-red transition-colors p-0.5">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <input value={goalInput} onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGoal()} maxLength={200}
              placeholder="e.g. No work after 8 PM this week"
              className="flex-1 bg-white/3 border border-ops-border rounded-xl px-3 py-2
                         text-sm font-body text-ops-text outline-none focus:border-ops-cyan
                         transition-colors placeholder:text-ops-muted/50" />
            <button onClick={addGoal} className="ops-btn flex items-center gap-1 px-3">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Activity + Focus Stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Activity breakdown */}
        <div className="ops-card p-5">
          <SectionHead icon={BarChart2} iconColor="text-ops-cyan" title="Today's Activity"
            sub="Live breakdown from your digital twin data." />

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-4 bg-ops-border/20 rounded animate-pulse" />)}
            </div>
          ) : !activityStats?.total_events ? (
            <p className="text-sm text-ops-muted italic font-body">
              No activity recorded yet. Start the FlowAI agent to see your live breakdown.
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(activityStats.category_counts || {}).map(([cat, count]) => {
                const pct = Math.round((count / activityStats.total_events) * 100)
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-ops-muted font-body">{cat}</span>
                      <span className="font-mono text-ops-muted/70">{pct}% ({count})</span>
                    </div>
                    <div className="h-1.5 bg-ops-border/30 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: catColors[cat] || '#64748b' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Focus stats */}
        <div className="ops-card p-5">
          <SectionHead icon={Flame} iconColor="text-ops-amber" title="Focus Stats"
            sub="Your wellness score and cognitive metrics." />

          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-ops-border/20 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[
                { val: wellness?.wellness_score ?? '—', label: 'Wellness Score', color: wellnessColor },
                {
                  val: activityStats?.efficiency != null ? activityStats.efficiency.toFixed(1) + '%' : '—',
                  label: 'Efficiency', color: '#00b4d8'
                },
                {
                  val: activityStats?.cognitive_battery != null ? activityStats.cognitive_battery.toFixed(1) : '—',
                  label: 'Cog. Battery', color: '#10b981'
                },
                {
                  val: activityStats?.burnout_score != null ? activityStats.burnout_score.toFixed(1) : '—',
                  label: 'Burnout Score', color: activityStats?.burnout_score > 60 ? '#dc2626' : '#f59e0b'
                },
              ].map(s => (
                <div key={s.label} className="bg-white/3 border border-ops-border/30 rounded-xl p-3">
                  <p className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.val}</p>
                  <p className="font-mono text-xs text-ops-muted tracking-widest mt-1">{s.label.toUpperCase()}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-ops-border/30">
            <p className="font-mono text-xs text-ops-muted tracking-widest mb-1">WELLNESS TREND</p>
            {moodHistory.length >= 3 ? (
              <p className="text-xs font-body text-ops-muted leading-relaxed">
                Mood avg <strong className="text-ops-text">
                  {(moodHistory.reduce((a, h) => a + h.mood_score, 0) / moodHistory.length).toFixed(1)}/5
                </strong> over {moodHistory.length} days —&nbsp;
                <strong className={trendColor}>{trendLabel}</strong>
              </p>
            ) : (
              <p className="text-xs text-ops-muted italic">Log daily mood to see your trend.</p>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
