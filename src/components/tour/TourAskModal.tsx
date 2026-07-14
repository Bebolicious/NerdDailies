import { useEffect } from 'react'
import { Flag, X } from 'lucide-react'
import { NeoButton } from '../ui/NeoButton'
import { TagPill } from '../ui/TagPill'
import { TOUR_GAMES, tourLabel } from '../../lib/tourScore'

type Props = {
  onAccept: () => void
  onDecline: () => void
  onHide: () => void
}

// First-visit-of-the-day invitation to play The Tour — a guided run through all
// five daily games with a combined score at the end.
export function TourAskModal({ onAccept, onDecline, onHide }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDecline()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDecline])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-emphasis/60 backdrop-blur-sm px-4"
      onClick={onDecline}
      role="dialog"
      aria-modal="true"
      aria-label="Play The Tour"
    >
      <div
        className="animate-tour-pop border-neo shadow-neo-lg bg-paper text-ink w-full max-w-md relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onDecline}
          aria-label="Close"
          className="absolute top-3 right-3 border-neo-2 p-1.5 bg-paper hover:bg-coral hover:text-ink-static transition-colors"
        >
          <X className="h-3.5 w-3.5 stroke-[3]" />
        </button>

        <div className="px-6 pt-7 pb-5 text-center">
          <div className="mx-auto mb-4 inline-flex border-neo bg-coral text-ink-static p-3 shadow-neo animate-tour-flag">
            <Flag className="h-8 w-8 stroke-[2.5]" />
          </div>
          <h2 className="font-display text-2xl uppercase tracking-wider font-bold leading-none">
            The Tour
          </h2>
          <p className="text-sm text-ink-soft mt-3 leading-relaxed">
            Play all five daily games back-to-back in one run. Every game scores
            points for how fast you solve it — finish the run for a combined
            score you can beat tomorrow.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {TOUR_GAMES.map((g, i) => (
              <div key={g} className="flex items-center gap-1.5">
                <TagPill tone={i === 0 ? 'coral' : 'paper'}>
                  {tourLabel(g)}
                </TagPill>
                {i < TOUR_GAMES.length - 1 && (
                  <span className="text-ink-soft font-bold" aria-hidden>
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          <div className="flex items-center justify-center gap-3">
            <NeoButton tone="coral" size="md" onClick={onAccept}>
              Start The Tour
            </NeoButton>
            <NeoButton tone="paper" size="md" onClick={onDecline}>
              Not today
            </NeoButton>
          </div>
          <button
            onClick={onHide}
            className="font-display text-[10px] uppercase tracking-wider text-ink-soft hover:text-ink underline underline-offset-2 mx-auto"
          >
            Hide this popup
          </button>
        </div>
      </div>
    </div>
  )
}
