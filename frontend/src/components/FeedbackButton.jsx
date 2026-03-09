import { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { useRateSuggestion, useMyRating } from '../hooks/useApi'
import { useAuthStore } from '../store/authStore'

/**
 * FeedbackButton — RLHF thumbs-up/down widget.
 *
 * Props:
 *   suggestionType  — 'observation' | 'recommendation' | 'plan_action' | 'actuation'
 *   suggestionId    — stable key for this specific suggestion (e.g. "obs-EMP001-0")
 *   suggestionText  — the text being rated (stored for RLHF training)
 *   context         — optional extra metadata dict
 *   size            — 'sm' | 'md' (default 'sm')
 *   showCounts      — show thumbs up/down counts (default true)
 */
export default function FeedbackButton({
  suggestionType,
  suggestionId,
  suggestionText = '',
  context = {},
  size = 'sm',
  showCounts = true,
}) {
  const { user } = useAuthStore()
  const empId = user?.emp_id || user?.sub || ''

  const { mutate: rate, isPending } = useRateSuggestion()
  const { data: myRatingData }      = useMyRating(suggestionId, empId)

  const [myRating,   setMyRating]   = useState(0)     // -1 | 0 | 1
  const [upCount,    setUpCount]    = useState(0)
  const [downCount,  setDownCount]  = useState(0)
  const [justRated,  setJustRated]  = useState(false)

  useEffect(() => {
    if (myRatingData?.rating) setMyRating(myRatingData.rating)
  }, [myRatingData])

  function handleRate(rating) {
    // Toggle off if clicking same button
    const newRating = myRating === rating ? 0 : rating

    // Optimistic update
    setMyRating(newRating)
    setJustRated(true)
    setTimeout(() => setJustRated(false), 1800)

    if (newRating === 0) return   // un-rating — no server call needed for MVP

    rate(
      {
        emp_id:          empId,
        suggestion_type: suggestionType,
        suggestion_id:   suggestionId,
        suggestion_text: suggestionText.slice(0, 300),
        rating:          newRating,
        context,
      },
      {
        onSuccess: (data) => {
          setUpCount(data.thumbs_up   ?? 0)
          setDownCount(data.thumbs_down ?? 0)
        },
      }
    )
  }

  const iconSize = size === 'sm' ? 11 : 14
  const btnBase  = `flex items-center gap-1 px-1.5 py-1 rounded transition-all duration-200 ${
    size === 'sm' ? 'text-xs' : 'text-sm'
  }`

  return (
    <div className={`flex items-center gap-1 ${justRated ? 'scale-105' : ''} transition-transform`}>

      {/* Thumbs Up */}
      <button
        onClick={() => handleRate(1)}
        disabled={isPending}
        title="This was helpful"
        className={`${btnBase} ${
          myRating === 1
            ? 'text-ops-green bg-ops-green/15 border border-ops-green/40'
            : 'text-ops-muted/50 hover:text-ops-green hover:bg-ops-green/10 border border-transparent'
        }`}
      >
        <ThumbsUp
          size={iconSize}
          className={myRating === 1 ? 'fill-ops-green/30' : ''}
        />
        {showCounts && upCount > 0 && (
          <span className="font-mono leading-none">{upCount}</span>
        )}
      </button>

      {/* Thumbs Down */}
      <button
        onClick={() => handleRate(-1)}
        disabled={isPending}
        title="This wasn't helpful"
        className={`${btnBase} ${
          myRating === -1
            ? 'text-ops-red bg-ops-red/15 border border-ops-red/40'
            : 'text-ops-muted/50 hover:text-ops-red hover:bg-ops-red/10 border border-transparent'
        }`}
      >
        <ThumbsDown
          size={iconSize}
          className={myRating === -1 ? 'fill-ops-red/30' : ''}
        />
        {showCounts && downCount > 0 && (
          <span className="font-mono leading-none">{downCount}</span>
        )}
      </button>

      {/* Transient "thanks" flash */}
      {justRated && myRating !== 0 && (
        <span className="font-mono text-xs text-ops-muted/60 animate-fade-in">
          {myRating === 1 ? 'noted ✓' : 'noted ✓'}
        </span>
      )}
    </div>
  )
}
