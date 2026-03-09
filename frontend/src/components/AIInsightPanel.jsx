import { useState } from 'react'
import { useGenerateInsight } from '../hooks/useApi'
import FeedbackButton from './FeedbackButton'
import {
  Brain, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, Lightbulb, Eye, MessageSquare
} from 'lucide-react'

export default function AIInsightPanel({ targetId, targetType = 'employee' }) {
  const [insight, setInsight] = useState(null)
  const [expanded, setExpanded] = useState(true)
  const { mutate, isPending, isError, error } = useGenerateInsight()

  const generate = (force = false) => {
    mutate(
      { target_id: targetId, target_type: targetType, force_refresh: force },
      { onSuccess: (data) => setInsight(data) }
    )
  }

  // Stable suggestion IDs keyed to content so feedback persists across sessions
  const sid = (prefix, i, text) =>
    `${prefix}-${targetId}-${i}-${btoa(encodeURIComponent(text.slice(0, 24))).replace(/[^a-z0-9]/gi, '').slice(0, 16)}`

  return (
    <div className="ops-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ops-border/50">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-ops-purple" style={{ filter: 'drop-shadow(0 0 6px #7c3aed)' }} />
          <span className="text-sm font-mono tracking-wider text-ops-text">GEMINI AI ANALYSIS</span>
          {insight?.cached && (
            <span className="text-xs font-mono text-ops-muted bg-ops-navy px-2 py-0.5 rounded">CACHED</span>
          )}
          {insight?.ai_provider && (
            <span className="text-xs font-mono text-ops-green bg-ops-green/10 px-2 py-0.5 rounded border border-ops-green/30">
              {insight.ai_provider}
            </span>
          )}
          {insight && (
            <span className="text-xs font-mono text-ops-muted/50 flex items-center gap-1 ml-1">
              <MessageSquare size={9} />RLHF
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {insight && (
            <button onClick={() => generate(true)} disabled={isPending}
              className="p-1.5 hover:text-ops-cyan text-ops-muted rounded hover:bg-ops-cyan/10 transition-colors">
              <RefreshCw size={13} className={isPending ? 'animate-spin' : ''} />
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="p-1 text-ops-muted hover:text-ops-text">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-5">
          {!insight && !isPending && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Brain size={36} className="text-ops-purple opacity-40" />
              <div>
                <p className="text-sm text-ops-muted font-body">AI insights not yet generated</p>
                <p className="text-xs text-ops-muted/60 mt-1">Gemini 1.5 Flash · Privacy-sanitised · RLHF-calibrated</p>
              </div>
              <button onClick={() => generate()} className="ops-btn flex items-center gap-2">
                <Brain size={14} /> Generate AI Insights
              </button>
            </div>
          )}

          {isPending && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="relative">
                <div className="w-10 h-10 border-2 border-ops-purple/30 rounded-full animate-spin border-t-ops-purple" />
                <Brain size={14} className="text-ops-purple absolute inset-0 m-auto" />
              </div>
              <p className="text-xs font-mono text-ops-muted animate-pulse">QUERYING GEMINI 1.5 FLASH…</p>
            </div>
          )}

          {isError && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm text-amber-300 font-mono font-bold">Gemini API Unavailable</p>
                  <p className="text-xs text-ops-muted font-body mt-1">
                    {error?.message?.includes('429') || error?.message?.includes('quota')
                      ? 'API quota exceeded. Insights will return when quota resets.'
                      : error?.message || 'Could not reach AI service.'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-ops-muted font-body text-center">
                The rest of FlowAI (twin data, forecasts, wellness, actuation) works independently of AI.
                <br />AI insights are an <em>enhancement</em>, not a dependency.
              </p>
              <button onClick={() => generate()} className="ops-btn flex items-center gap-2 mx-auto text-xs">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {insight && !isPending && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-mono text-ops-muted/60 bg-ops-black/30 border border-ops-border/20 rounded px-3 py-2">
                <MessageSquare size={10} className="text-ops-purple/60" />
                Hover each suggestion to rate it — your feedback trains the AI over time
              </div>

              {insight.risk_summary && (
                <div className={
                  insight.risk_summary === 'AI service not available'
                    ? "bg-amber-500/10 border border-amber-500/30 rounded p-3"
                    : "bg-ops-purple/10 border border-ops-purple/30 rounded p-3"
                }>
                  <p className={
                    insight.risk_summary === 'AI service not available'
                      ? "text-xs font-mono text-amber-400 mb-1 tracking-wider"
                      : "text-xs font-mono text-ops-purple mb-1 tracking-wider"
                  }>ASSESSMENT</p>
                  <p className="text-sm text-ops-text font-body leading-relaxed">{insight.risk_summary}</p>
                </div>
              )}

              {insight.observations?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Eye size={13} className="text-ops-cyan" />
                    <span className="text-xs font-mono tracking-wider text-ops-muted">OBSERVATIONS</span>
                  </div>
                  <ul className="space-y-3">
                    {insight.observations.map((obs, i) => (
                      <li key={i} className="group flex gap-2.5">
                        <span className="font-mono text-ops-cyan/60 mt-0.5 shrink-0 text-sm">{String(i + 1).padStart(2, '0')}.</span>
                        <div className="flex-1">
                          <p className="text-sm text-ops-text font-body leading-relaxed">{obs}</p>
                          <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <FeedbackButton
                              suggestionType="observation"
                              suggestionId={sid('obs', i, obs)}
                              suggestionText={obs}
                              context={{ target_id: targetId, target_type: targetType }}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insight.recommendations?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Lightbulb size={13} className="text-ops-amber" />
                    <span className="text-xs font-mono tracking-wider text-ops-muted">RECOMMENDATIONS</span>
                  </div>
                  <ul className="space-y-3">
                    {insight.recommendations.map((rec, i) => (
                      <li key={i} className="group flex gap-2.5">
                        <span className="font-mono text-ops-amber/60 mt-0.5 shrink-0 text-sm">→</span>
                        <div className="flex-1">
                          <p className="text-sm text-ops-text font-body leading-relaxed">{rec}</p>
                          <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <FeedbackButton
                              suggestionType="recommendation"
                              suggestionId={sid('rec', i, rec)}
                              suggestionText={rec}
                              context={{ target_id: targetId, target_type: targetType }}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insight.generated_at && (
                <p className="text-xs font-mono text-ops-muted/50 text-right">
                  Generated: {new Date(insight.generated_at).toLocaleString()}
                  {insight.privacy_audit && (
                    <span className="ml-2 text-ops-green/50">· DP ε={insight.privacy_audit.epsilon}</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
