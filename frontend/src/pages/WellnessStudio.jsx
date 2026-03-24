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
  '3.5': { label: 'Flow (3.5s)', phases: ['Inhale', 'Exhale'], durations: [3.5, 3.5] },
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
  { id: 'work', label: 'Focus · 25m', mins: 25, color: '#ff9f1a' },
  { id: 'short_break', label: 'Break · 5m', mins: 5, color: '#4fa3ff' },
  { id: 'long_break', label: 'Long · 15m', mins: 15, color: '#00e6c3' },
]
// Add to WellnessStudio.jsx — MBI Survey tab
// This is a complete tab section. Add it as a new tab alongside existing ones.

const MBISurveyTab = ({ empId }) => {
  const [structure, setStructure] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    axios.get('/api/mbi/structure')
      .then(r => setStructure(r.data))
      .catch(() => setError('Could not load survey'))
  }, [])

  const allAnswered = structure
    ? Object.values(structure.questions).flat().every(q => answers[q.id] !== undefined)
    : false

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const r = await axios.post('/api/mbi/submit', { responses: answers })
      setResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    const raw = result.scores.raw
    const z = result.scores.z_scores
    const level = result.classification.burnout_level
    const color = level === 'high_risk' ? 'text-red-500' :
      level === 'medium_risk' ? 'text-amber-500' : 'text-green-500'
    return (
      <div className="space-y-4">
        <div className="ops-card p-5">
          <h3 className="font-semibold text-ops-text mb-1">MBI-GS Results</h3>
          <p className={`text-lg font-bold mb-3 ${color}`}>
            {level === 'high_risk' ? '🔴 High Risk' :
              level === 'medium_risk' ? '⚠️ Moderate Risk' : '✅ Low Risk'}
          </p>
          <div className="grid grid-cols-3 gap-3 text-center text-sm mb-4">
            <div><p className="text-ops-muted text-xs">Exhaustion</p>
              <p className="font-bold">{raw.exhaustion} <span className="text-ops-muted font-normal">/36</span></p></div>
            <div><p className="text-ops-muted text-xs">Cynicism</p>
              <p className="font-bold">{raw.cynicism} <span className="text-ops-muted font-normal">/30</span></p></div>
            <div><p className="text-ops-muted text-xs">Efficacy</p>
              <p className="font-bold">{raw.professional_efficacy} <span className="text-ops-muted font-normal">/30</span></p></div>
          </div>
          <p className="text-xs text-ops-muted">{result.classification.recommendation}</p>
          <p className="text-xs text-ops-muted mt-1">
            {result.scores.percentile}th percentile · {result.classification.scientific_grounding}
          </p>
        </div>
        <button
          onClick={() => { setResult(null); setAnswers({}) }}
          className="text-xs text-ops-cyan underline"
        >
          Retake survey
        </button>
      </div>
    )
  }

  if (!structure) return <div className="text-ops-muted text-sm">{error || 'Loading survey…'}</div>

  const scaleLabels = structure.scale

  return (
    <div className="space-y-6">
      <div className="ops-card p-4">
        <h3 className="font-semibold text-ops-text mb-1">{structure.survey_name}</h3>
        <p className="text-xs text-ops-muted mb-3">
          {structure.description} · ~{structure.duration_minutes} min · Validated 1995
        </p>
        <p className="text-xs text-ops-muted italic">{structure.consent_reminder}</p>
      </div>

      {Object.entries(structure.questions).map(([subscale, questions]) => (
        <div key={subscale} className="ops-card p-4">
          <h4 className="text-sm font-semibold text-ops-cyan mb-3 capitalize">
            {structure.subscales[subscale]?.name || subscale}
          </h4>
          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.id}>
                <p className="text-sm text-ops-text mb-2">{q.text}</p>
                <div className="flex gap-1 flex-wrap">
                  {[0, 1, 2, 3, 4, 5, 6].map(val => (
                    <button
                      key={val}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: val }))}
                      className={`px-2 py-1 text-xs rounded border transition-all
                        ${answers[q.id] === val
                          ? 'bg-ops-cyan text-ops-black border-ops-cyan'
                          : 'bg-ops-navy/30 border-ops-border/30 text-ops-muted hover:border-ops-cyan/40'}`}
                      title={scaleLabels[String(val)]}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                {answers[q.id] !== undefined && (
                  <p className="text-xs text-ops-muted mt-1">
                    {scaleLabels[String(answers[q.id])]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || submitting}
        className="w-full py-3 rounded-lg border bg-ops-cyan/10 border-ops-cyan/30
                   text-ops-cyan font-mono text-sm tracking-wider
                   hover:bg-ops-cyan/20 transition-all disabled:opacity-30"
      >
        {submitting ? 'Submitting…' : allAnswered ? 'Submit Assessment' : `${Object.keys(answers).length}/16 answered`}
      </button>
    </div>
  )
}

const RISK_COLOR = { LOW: '#00e6c3', MEDIUM: '#ff9f1a', HIGH: '#ff4c4c', CRITICAL: '#dc2626' }

// ── Wellness ring canvas ────────────────────────────────────────────────────
function WellnessRing({ score = 75, size = 120 }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = size / 2, cy = size / 2, r = size / 2 - 10
    const color = score >= 70 ? '#00e6c3' : score >= 45 ? '#ff9f1a' : '#ff4c4c'
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
    const cx = 128, cy = 128
    ctx.clearRect(0, 0, 256, 256)
    const minR = 46, maxR = 101
    const r = minR + (maxR - minR) * t
    for (let i = 3; i >= 1; i--) {
      ctx.beginPath(); ctx.arc(cx, cy, r + i * 11, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(79,163,255,${(0.03 + t * 0.08) / i})`
      ctx.lineWidth = 1; ctx.stroke()
    }
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    gr.addColorStop(0, `rgba(79,163,255,${0.07 + t * 0.15})`)
    gr.addColorStop(1, `rgba(4,11,20,${0.04 + t * 0.08})`)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = gr; ctx.fill()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(79,163,255,${0.3 + t * 0.5})`
    ctx.lineWidth = 2; ctx.stroke()
  }, [t])
  return <canvas ref={ref} width={256} height={256} className="absolute top-0 left-0" style={{ filter: 'drop-shadow(0 0 25px rgba(79,163,255,0.25))' }} />
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
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 8; ctx.stroke()
    if (frac > 0) {
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
      ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(cx, cy, r + 15, 0, Math.PI * 2)
    ctx.strokeStyle = color + '14'; ctx.lineWidth = 1; ctx.stroke()
  }, [frac, color])
  return <canvas ref={ref} width={176} height={176} className="absolute top-0 left-0" style={{ filter: 'drop-shadow(0 0 30px rgba(255,159,26,0.3))' }} />
}

// ── Section header ──────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, iconColor = 'text-[#3b82f6]', title, sub }) {
  return (
    <div className="flex items-center gap-[12px] mb-[24px]">
      <div className="w-10 h-10 border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
        <Icon size={18} className={iconColor} />
      </div>
      <div>
        <h2 className="text-[18px] font-body font-semibold text-[#e2e8f0] leading-[1.4]">{title}</h2>
        {sub && <p className="text-[11px] text-[#94a3b8] mt-0.5 leading-[1.4]">{sub}</p>}
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
    'Productive': '#00e6c3', 'Productive (Contextual)': '#10b981',
    'Neutral': '#4fa3ff', 'Distraction': '#ff4c4c', 'Wellness': '#8b5cf6'
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-[32px] animate-slide-up p-[24px] min-h-screen rounded-[16px] text-[#e2e8f0] bg-[#0B1623]" style={{
      backgroundImage: `
        radial-gradient(ellipse at top center, rgba(11,42,60,0.5) 0%, #0B1623 100%),
        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
      `,
      backgroundSize: '100% 100%, 40px 40px, 40px 40px'
    }}>

      {/* Toast */}
      {toastVisible && (
        <div className="fixed bottom-[32px] right-[32px] z-50 bg-[#0f172a] border border-[#3b82f6] text-[#e2e8f0]
                        px-[24px] py-[16px] rounded-[12px] text-[13px] font-body shadow-[0_0_0_1px_rgba(255,255,255,0.04),_0_6px_14px_rgba(0,0,0,0.25)] animate-fade-in">
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
      <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px] grid grid-cols-12 gap-[24px] relative overflow-hidden">
        {/* Left: Wellness Score (22% ~ 3 cols) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col items-center justify-center relative z-10">
          <div className="relative rounded-full" style={{ boxShadow: '0 0 40px rgba(0,230,195,0.25)' }}>
            <WellnessRing score={wellnessScore} size={165} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-mono text-[34px] font-bold leading-[1]" style={{ color: wellnessColor }}>
                {loading ? '—' : wellnessScore}
              </span>
              <span className="text-[11px] font-mono text-[#94a3b8] tracking-widest mt-1">WELLNESS</span>
            </div>
          </div>
        </div>

        {/* Middle: Wellness Studio Text (50% ~ 6 cols) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col justify-center relative z-10 px-[16px]">
          <div className="inline-block font-mono text-[11px] tracking-widest text-[#00e6c3]
                          bg-[#00e6c3]/10 border border-[#00e6c3]/20 px-[12px] py-[4px] rounded-full mb-[16px] w-fit">
            ✦ YOUR PERSONAL WELLNESS SPACE
          </div>
          <h1 className="font-display text-[32px] font-bold text-[#e2e8f0] tracking-wide mb-[8px] leading-[1.2]">
            Wellness Studio
          </h1>
          <p className="text-[13px] text-[#94a3b8] font-body leading-[1.4] max-w-lg">
            This space is for you, not for HR. Mood logs are private. Use the tools to build
            sustainable energy — not just get through the sprint.
          </p>
        </div>

        {/* Right: Stats Cluster (28% ~ 3 cols) */}
        {plan && (
          <div className="col-span-12 lg:col-span-3 flex items-center justify-center relative z-10 border-l border-[rgba(255,255,255,0.04)] pl-[24px]">
            <div className="grid grid-cols-2 gap-[24px] w-full" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {[
                { val: plan.hr_stress != null ? plan.hr_stress + '/10' : '—', label: 'Stress', color: plan.hr_stress >= 7 ? '#ff4c4c' : '#00e6c3' },
                { val: plan.hr_wlb != null ? plan.hr_wlb + '/10' : '—', label: 'Work-Life', color: plan.hr_wlb <= 4 ? '#ff4c4c' : '#00e6c3' },
                { val: plan.hr_hours != null ? plan.hr_hours + 'h' : '—', label: 'Hours', color: '#ff9f1a' },
                { val: plan.hr_wfh != null ? plan.hr_wfh + 'd' : '—', label: 'WFH', color: '#4fa3ff' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="font-mono text-[24px] font-bold leading-[1.2]" style={{ color: s.color }}>{s.val}</p>
                  <p className="font-mono text-[11px] font-medium tracking-widest mt-[8px]" style={{ color: 'inherit' }}>{s.label.toUpperCase()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mood Check-in ── */}
      <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px]">
        <SectionHead icon={Heart} iconColor="text-[#ff4c4c]" title="Daily Check-in"
          sub="20 seconds. Helps you spot patterns you would never notice otherwise." />

        {todayMood && (
          <div className="flex items-center gap-[16px] bg-[#00e6c3]/10 border border-[#00e6c3]/20 rounded-[14px] p-[16px] mb-[24px]">
            <span className="text-[32px] drop-shadow-md">{MOOD_OPTIONS.find(m => m.v === todayMood.mood_score)?.emoji}</span>
            <div>
              <p className="text-[13px] font-body font-semibold text-[#00e6c3] leading-[1.4]">
                Checked in: {MOOD_OPTIONS.find(m => m.v === todayMood.mood_score)?.label}
              </p>
              <p className="text-[11px] text-[#94a3b8] mt-0.5 leading-[1.4]">
                Energy {todayMood.energy_score}/5{todayMood.note ? ` — ${todayMood.note}` : ''} · Tap to update
              </p>
            </div>
          </div>
        )}

        <p className="text-[11px] text-[#94a3b8] mb-[16px]">How is your mood right now?</p>
        <div className="flex justify-between gap-[16px] mb-[32px] flex-wrap">
          {MOOD_OPTIONS.map(({ v, emoji, label }) => (
            <button key={v} onClick={() => setSelectedMood(v)}
              className={`flex-1 flex flex-col items-center gap-[8px] p-[10px] rounded-[10px] border transition-all duration-180 ${selectedMood === v
                ? 'bg-[rgba(255,255,255,0.04)] border-[#4fa3ff] shadow-[0_0_10px_rgba(79,163,255,0.4)] transform -translate-y-1'
                : 'bg-[rgba(255,255,255,0.04)] border-transparent hover:border-[#4fa3ff]/30'
                }`}>
              <span className="text-[32px] drop-shadow-sm">{emoji}</span>
              <span className="text-[11px] font-mono text-[#94a3b8] tracking-wider">{label.toUpperCase()}</span>
            </button>
          ))}
        </div>

        <div className="h-px w-full bg-[rgba(255,255,255,0.04)] mb-[24px]" />

        <div className="mb-[24px] -mt-1">
          <div className="flex justify-between items-center text-[11px] text-[#94a3b8] mb-[12px]">
            <span>Energy Level</span>
            <span className="font-mono bg-[rgba(255,255,255,0.04)] px-[8px] py-[4px] rounded">{energyLevel} / 5</span>
          </div>
          <div className="relative h-[6px] w-full bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-300 pointer-events-none" style={{ width: `${(energyLevel / 5) * 100}%`, background: 'linear-gradient(90deg, #00E6C3, #4FA3FF)' }} />
            <input type="range" min={1} max={5} value={energyLevel}
              onChange={e => setEnergyLevel(Number(e.target.value))}
              className="absolute top-0 w-full h-full opacity-0 cursor-pointer" />
          </div>
        </div>

        <textarea value={moodNote} onChange={e => setMoodNote(e.target.value)}
          placeholder="Optional: anything on your mind? (only you can see this)"
          className="w-full h-[52px] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded-[14px] text-[#e2e8f0] px-[16px] py-[14px]
                     text-[13px] font-body resize-none outline-none mb-[24px]
                     focus:border-[#4fa3ff] transition-all duration-180 placeholder:text-[#94a3b8]/50 shadow-inner" />

        <div className="flex items-center justify-between">
          <button onClick={submitMood} className="h-[40px] px-[24px] rounded-[10px] bg-[#4fa3ff]/10 text-[#4fa3ff] hover:bg-[#4fa3ff]/20 shadow-[0_0_0_1px_rgba(79,163,255,0.3)] transition-all duration-120 font-body text-[13px] flex items-center gap-[8px] font-semibold">
            <Heart size={14} /> Save Check-in
          </button>
          <span className="text-[11px] font-mono text-[#94a3b8]/60 uppercase tracking-widest">Private Space</span>
        </div>
      </div>

      {/* ── Breathe + Pomodoro ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[32px]">

        {/* Breathing */}
        <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px] flex flex-col justify-between">
          <div>
            <SectionHead icon={Wind} iconColor="text-[#4fa3ff]" title="Guided Breathing"
              sub="Box breathing lowers cortisol in under 4 minutes." />

            <div className="flex gap-[8px] mb-[16px] flex-wrap">
              {Object.entries(BREATH_MODES).map(([key, m]) => (
                <button key={key} onClick={() => { resetBreath(); setBreathMode(key) }}
                  className={`px-[12px] py-[6px] rounded-full text-[11px] font-mono border transition-all ${breathMode === key
                    ? 'bg-[#4fa3ff]/10 border-[#4fa3ff] text-[#4fa3ff] shadow-[0_0_10px_rgba(79,163,255,0.3)]'
                    : 'border-[rgba(255,255,255,0.1)] text-[#94a3b8] hover:border-[#4fa3ff]/40 hover:text-[#e2e8f0]'
                    }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center flex-1">
            <div className="relative w-[256px] h-[256px] flex items-center justify-center mb-[24px]">
              <BreathCanvas phase={breathPhase} t={breathT} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-display text-[18px] text-[#e2e8f0] drop-shadow-md">{breathPhase}</span>
                <span className="font-mono text-[34px] font-bold text-[#4fa3ff] mt-1 drop-shadow-[0_0_12px_rgba(79,163,255,0.4)]">
                  {breathRunning ? breathCount : '—'}
                </span>
                <span className="font-mono text-[11px] text-[#94a3b8] tracking-widest mt-1">
                  {breathRunning ? breathPhase.toUpperCase() : 'PRESS START'}
                </span>
              </div>
            </div>

            <div className="flex w-full items-center justify-between mt-auto">
              <div className="flex gap-[8px]">
                <button onClick={() => breathRunning ? stopBreath() : startBreath()}
                  className={`h-[40px] px-[24px] rounded-[10px] font-body text-[13px] font-semibold flex items-center gap-[8px] transition-all duration-120 hover:-translate-y-0.5 ${breathRunning
                    ? 'bg-[#ff4c4c]/10 text-[#ff4c4c] border-transparent hover:bg-[#ff4c4c]/20'
                    : 'bg-[#00e6c3]/10 text-[#00e6c3] border-transparent hover:bg-[#00e6c3]/20 shadow-[0_0_12px_rgba(0,230,195,0.3)]'}`}>
                  {breathRunning ? '⏸ Pause' : '▶ Start'}
                </button>
                <button onClick={resetBreath}
                  className="h-[40px] px-[16px] rounded-[10px] font-body text-[13px] border border-[rgba(255,255,255,0.1)] text-[#94a3b8]
                             hover:bg-[rgba(255,255,255,0.05)] hover:text-[#e2e8f0] transition-colors">
                  Reset
                </button>
              </div>
              <p className="font-mono text-[11px] text-[#94a3b8] tracking-widest uppercase">
                Cycles: {breathCycles}
              </p>
            </div>
          </div>
        </div>

        {/* Pomodoro */}
        <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px] flex flex-col justify-between">
          <div>
            <SectionHead icon={Timer} iconColor="text-[#ff9f1a]" title="Focus Timer"
              sub="Pomodoro builds real deep work capacity over time." />

            <div className="flex bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-[12px] p-[4px] mb-[16px]">
              {POMO_MODES.map((m, i) => (
                <button key={m.id} onClick={() => changePomoMode(i)}
                  className={`flex-1 py-[6px] rounded-[8px] text-[11px] font-mono transition-all ${pomoModeIdx === i
                    ? 'text-[#e2e8f0] shadow-sm'
                    : 'text-[#94a3b8] hover:text-[#e2e8f0]'
                    }`}
                  style={pomoModeIdx === i ? { background: m.color + '22', color: m.color, border: `1px solid ${m.color}44` } : { border: '1px solid transparent' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center flex-1">
            <div className="relative w-[176px] h-[176px] mb-[24px] flex items-center justify-center">
              <PomoCanvas frac={pomoFrac} color={pomoMode.color} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-mono text-[34px] font-bold text-[#e2e8f0] tracking-tight drop-shadow-md">
                  {pomoDisplay}
                </span>
                <span className="font-mono text-[11px] text-[#94a3b8] tracking-widest mt-1">
                  {pomoModeIdx === 0 ? 'FOCUS' : pomoModeIdx === 1 ? 'SHORT BREAK' : 'LONG BREAK'}
                </span>
              </div>
            </div>

            <div className="flex w-full items-center justify-between mt-auto">
              <div className="flex gap-[8px]">
                <button onClick={togglePomo}
                  className={`h-[40px] px-[24px] rounded-[10px] font-body text-[13px] font-semibold flex items-center gap-[8px] transition-all duration-120 hover:-translate-y-0.5 ${pomoRunning
                    ? 'bg-[#ff4c4c]/10 text-[#ff4c4c] border-transparent hover:bg-[#ff4c4c]/20'
                    : 'bg-[#00e6c3]/10 text-[#00e6c3] border-transparent hover:bg-[#00e6c3]/20 shadow-[0_0_12px_rgba(0,230,195,0.3)]'}`}>
                  {pomoRunning ? '⏸ Pause' : '▶ Start'}
                </button>
                <button onClick={() => { clearInterval(pomoInterval.current); setPomoRunning(false); setPomoRemaining(pomoMode.mins * 60) }}
                  className="h-[40px] px-[16px] rounded-[10px] font-body text-[13px] border border-[rgba(255,255,255,0.1)] text-[#94a3b8]
                             hover:bg-[rgba(255,255,255,0.05)] hover:text-[#e2e8f0] transition-colors">
                  ↺ Reset
                </button>
              </div>
              <p className="font-mono text-[11px] text-[#94a3b8] uppercase tracking-widest text-right">
                Today: <br /><span className="text-[#ff9f1a] font-bold text-[13px]">{focusMins}</span> mins
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Personalised Plan ── */}
      <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px]">
        <SectionHead icon={Zap} iconColor="text-[#8b5cf6]" title="Your Plan for Today"
          sub="Generated from your actual digital twin data — not a generic list." />
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-36 bg-[rgba(255,255,255,0.02)] rounded-[12px] animate-pulse" />
            ))}
          </div>
        ) : !plan?.actions?.length ? (
          <p className="text-[13px] text-[#94a3b8] font-body italic text-center py-[24px] bg-[rgba(255,255,255,0.02)] rounded-[14px]">
            No plan yet — log some activity to generate personalised recommendations.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[28px]">
            {plan.actions.map((a, i) => {
              const planSid = `plan-${empId}-${i}-${btoa(encodeURIComponent(a.title.slice(0, 20))).replace(/[^a-z0-9]/gi, '').slice(0, 16)}`
              const taskCategory = (a.category || '').toLowerCase();
              const catColor = taskCategory === 'task' ? '#00e6c3' : taskCategory === 'habit' ? '#8b5cf6' : '#10b981';

              return (
                <div key={i} className="bg-[rgba(255,255,255,0.02)] rounded-[10px] p-[24px] relative overflow-hidden group shadow-sm transition-all duration-180 hover:bg-[rgba(255,255,255,0.04)] border-l-[3px]" style={{ borderColor: catColor }}>
                  <div className="flex items-start gap-[12px] mb-[8px]">
                    <span className="text-[20px] drop-shadow-sm">{a.icon}</span>
                    <div className="flex-1">
                      <p className="font-mono text-[11px] text-[#94a3b8] tracking-widest mb-[4px]" style={{ color: catColor }}>
                        {a.category.toUpperCase()}
                      </p>
                      <p className="text-[13px] font-body font-semibold text-[#e2e8f0] leading-[1.4]">{a.title}</p>
                    </div>
                  </div>
                  <p className="text-[13px] text-[#94a3b8] opacity-70 font-body leading-[1.5] mb-[12px] mt-[8px]">
                    {a.body}
                  </p>
                  <div className="flex items-center justify-between mt-[16px]">
                    <span className={`inline-block px-[8px] py-[4px] rounded-[4px] text-[11px] font-mono font-bold ${a.priority === 'high' ? 'bg-[#ff4c4c]/15 text-[#ff4c4c]' :
                      a.priority === 'medium' ? 'bg-[#ff9f1a]/15 text-[#ff9f1a]' : 'bg-[#00e6c3]/15 text-[#00e6c3]'
                      }`}>
                      {a.priority.toUpperCase()}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-180">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[32px]">

        {/* Mood chart */}
        <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px]">
          <SectionHead icon={TrendingUp} iconColor="text-[#00e6c3]" title="Mood History"
            sub="14-day view of mood and energy patterns." />
          {chartData.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic text-center py-[32px]">
              Log your mood daily to see patterns here.
            </p>
          ) : (
            <>
              {/* Increased chart height by ~40% (200 -> 280) */}
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Share Tech Mono' }} tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Share Tech Mono' }} tickMargin={10} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0B1623', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontFamily: 'Share Tech Mono', fontSize: 11, boxShadow: '0 0 16px rgba(0,0,0,0.5)' }} />
                  {/* Legend positioned at bottom */}
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Share Tech Mono', paddingTop: '16px' }} verticalAlign="bottom" />
                  <Line type="monotone" dataKey="mood" stroke="#00e6c3" strokeWidth={3}
                    dot={{ r: 6, fill: '#0B1623', stroke: '#00e6c3', strokeWidth: 2 }} activeDot={{ r: 8, fill: '#00e6c3', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="energy" stroke="#ff9f1a" strokeWidth={3}
                    strokeDasharray="4 4" dot={{ r: 5, fill: '#0B1623', stroke: '#ff9f1a', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
              {moodHistory.length >= 2 && (
                <p className={`text-[11px] font-mono mt-[24px] text-center uppercase tracking-widest text-[#00e6c3]`}>
                  Avg mood {(moodHistory.reduce((a, h) => a + h.mood_score, 0) / moodHistory.length).toFixed(1)}/5
                  &nbsp;·&nbsp;trend: {trendLabel} over {moodHistory.length} days
                </p>
              )}
            </>
          )}
        </div>

        {/* Weekly goals */}
        <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px] flex flex-col justify-between">
          <div>
            <SectionHead icon={Target} iconColor="text-[#8b5cf6]" title="Weekly Commitments"
              sub="Up to 3 small goals you own this week." />

            {weekStart && (
              <p className="font-mono text-[11px] text-[#94a3b8] tracking-widest mb-[16px]">
                WEEK OF {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
              </p>
            )}

            {goals.length === 0 ? (
              <p className="text-[13px] italic text-[#94a3b8] text-center py-[24px] font-body bg-[rgba(255,255,255,0.02)] rounded-[14px]">
                No goals yet this week. Add one below.
              </p>
            ) : (
              <div className="flex flex-col gap-[16px] mb-[24px]">
                {goals.map(g => (
                  <div key={g.id} className="flex items-center gap-[12px] py-[8px] border-b border-[rgba(255,255,255,0.05)] pb-[16px] last:border-0 last:pb-0">
                    <button onClick={() => toggleGoal(g.id, !g.completed)}
                      className={`w-[24px] h-[24px] rounded-[6px] border-[2px] flex items-center justify-center shrink-0 transition-all ${g.completed ? 'bg-[#10b981] border-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'border-[rgba(255,255,255,0.2)] hover:border-[#00e6c3]'
                        }`}>
                      {g.completed && <span className="text-[#0B1623] text-[13px] font-bold leading-none">✓</span>}
                    </button>
                    <span className={`flex-1 text-[13px] font-body ${g.completed ? 'line-through text-[#94a3b8] opacity-50' : 'text-[#e2e8f0]'}`}>
                      {g.completed ? g.goal_text : <strong>{g.goal_text}</strong>}
                    </span>
                    <button onClick={() => setGoals(goals.filter(x => x.id !== g.id))}
                      className="text-[#94a3b8] hover:text-[#ff4c4c] transition-colors p-[4px] rounded hover:bg-[#ff4c4c]/10">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto pt-[24px]">
            <p className="text-[11px] text-[#94a3b8] font-mono tracking-widest mb-[8px] opacity-60 uppercase w-5/6 mx-auto text-center">Set a personal commitment for the week</p>
            <div className="flex gap-[8px] w-5/6 mx-auto">
              <input value={goalInput} onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGoal()} maxLength={200}
                placeholder="e.g. No work after 8 PM this week"
                className="flex-1 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-[16px] py-[10px]
                           text-[13px] font-body text-[#e2e8f0] outline-none focus:border-[#4fa3ff] shadow-inner
                           transition-colors placeholder:text-[#94a3b8]/50" />
              <button onClick={addGoal} className="h-[42px] px-[16px] rounded-[8px] bg-[#4fa3ff]/10 text-[#4fa3ff] hover:bg-[#4fa3ff]/20 transition-all flex items-center gap-1 shadow-[0_0_0_1px_rgba(79,163,255,0.2)]">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MBI Burnout Assessment ── */}
      <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px]">
        <SectionHead icon={Brain} iconColor="text-[#f59e0b]" title="Burnout Self-Assessment (MBI-GS)"
          sub="Validated 16-question psychological instrument — complements AI telemetry scoring." />
        <MBISurveyTab empId={empId} />
      </div>

      {/* ── Activity + Focus Stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[32px]">

        {/* Activity breakdown */}
        <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px]">
          <SectionHead icon={BarChart2} iconColor="text-[#4fa3ff]" title="Today's Activity"
            sub="Live breakdown from your digital twin data." />

          {loading ? (
            <div className="space-y-[16px]">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-4 bg-[rgba(255,255,255,0.02)] rounded animate-pulse" />)}
            </div>
          ) : !activityStats?.total_events ? (
            <p className="text-[13px] text-[#94a3b8] italic font-body py-[16px]">
              No activity recorded yet. Start the FlowAI agent to see your live breakdown.
            </p>
          ) : (
            <div className="flex flex-col gap-[18px]">
              {Object.entries(activityStats.category_counts || {}).map(([cat, count]) => {
                const pct = Math.round((count / activityStats.total_events) * 100)
                return (
                  <div key={cat}>
                    <div className="flex justify-between items-center mb-[8px]">
                      <span className="text-[#e2e8f0] text-[13px] font-body font-medium">{cat}</span>
                      <span className="font-mono text-[#94a3b8] text-[11px]">{pct}% ({count})</span>
                    </div>
                    {/* Activity bars thickness increased 10px -> 12px */}
                    <div className="h-[12px] bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden shadow-inner flex flex-col justify-center">
                      <div className="h-full rounded-full transition-all duration-700 shadow-md"
                        style={{ width: `${pct}%`, background: catColors[cat] || '#64748b' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Focus stats */}
        <div className="bg-[#0B1623] shadow-[0_10px_25px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.04)] rounded-[14px] p-[24px]">
          <SectionHead icon={Flame} iconColor="text-[#ff9f1a]" title="Focus Stats"
            sub="Your wellness score and cognitive metrics." />

          {loading ? (
            <div className="grid grid-cols-2 gap-[24px]">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-[80px] bg-[rgba(255,255,255,0.02)] rounded-[10px] animate-pulse" />)}
            </div>
          ) : (
            // Minimal stats card with removed backgrounds and glow on metric
            <div className="grid grid-cols-2 gap-[20px]">
              {[
                { val: wellness?.wellness_score ?? '—', label: 'Wellness Score', color: wellnessColor },
                {
                  val: activityStats?.efficiency != null ? activityStats.efficiency.toFixed(1) + '%' : '—',
                  label: 'Efficiency', color: '#4fa3ff'
                },
                {
                  val: activityStats?.cognitive_battery != null ? activityStats.cognitive_battery.toFixed(1) : '—',
                  label: 'Cog. Battery', color: '#00e6c3'
                },
                {
                  val: activityStats?.burnout_score != null ? activityStats.burnout_score.toFixed(1) : '—',
                  label: 'Burnout Score', color: activityStats?.burnout_score > 60 ? '#ff4c4c' : '#ff9f1a'
                },
              ].map(s => (
                <div key={s.label} className="bg-[rgba(255,255,255,0.02)] rounded-[10px] p-[20px] transition-transform duration-180 hover:bg-[rgba(255,255,255,0.04)]">
                  <p className="font-mono text-[34px] font-bold leading-[1]" style={{ color: s.color, filter: `drop-shadow(0 0 16px ${s.color}55)` }}>{s.val}</p>
                  <p className="font-mono text-[11px] text-[#94a3b8] tracking-widest mt-[16px]">{s.label.toUpperCase()}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-[32px] pt-[24px] border-t border-[rgba(255,255,255,0.05)]">
            <p className="font-mono text-[11px] text-[#4fa3ff] tracking-widest mb-[8px]">WELLNESS TREND</p>
            {moodHistory.length >= 3 ? (
              <p className="text-[13px] font-body text-[#94a3b8] leading-[1.6]">
                Mood avg <strong className="text-[#e2e8f0]">
                  {(moodHistory.reduce((a, h) => a + h.mood_score, 0) / moodHistory.length).toFixed(1)}/5
                </strong> over {moodHistory.length} days —&nbsp;
                <strong className={trendColor}>{trendLabel}</strong>
              </p>
            ) : (
              <p className="text-[13px] text-[#94a3b8] italic">Log daily mood to see your trend.</p>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
