import { useEffect, useMemo, useRef, useState } from 'react'
import { Share2, Trophy, X } from 'lucide-react'
import { NeoCard } from '../ui/NeoCard'
import { NeoButton } from '../ui/NeoButton'
import { cn } from '../../lib/cn'
import { addDays, format, parseISO } from 'date-fns'
import { dayNumber } from '../../lib/dates'
import {
  computeTourBreakdown,
  getTourSnapshot,
  saveTourSnapshot,
  type TourGame,
} from '../../lib/tourScore'

type Props = {
  date: string
  onClose: () => void
}

// The tour finale: a per-game score breakdown, the combined total (with a
// count-up), and — if the player ran the tour the day before — a delta against
// that run so they can see where they improved. Snapshots today's total on
// mount so tomorrow can compare back.
export function TourScoreModal({ date, onClose }: Props) {
  const breakdown = useMemo(() => computeTourBreakdown(date), [date])

  // Yesterday's snapshot must be read BEFORE we save today's (different keys, so
  // order is safe, but read first for clarity).
  const prev = useMemo(() => {
    const yesterday = format(addDays(parseISO(date), -1), 'yyyy-MM-dd')
    return getTourSnapshot(yesterday)
  }, [date])

  useEffect(() => {
    saveTourSnapshot(date)
  }, [date])

  const total = breakdown.total
  const animatedTotal = useCountUp(total, 900)

  const delta = prev ? total - prev.total : null
  const prevPerGame = useMemo(() => {
    const m = new Map<TourGame, number>()
    prev?.perGame.forEach((g) => m.set(g.gameType, g.score))
    return m
  }, [prev])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const [copied, setCopied] = useState(false)
  function onShare() {
    const lines = [
      `The Tour · Day #${dayNumber(date)}`,
      `Score: ${total}`,
      ...(delta != null
        ? [`${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs yesterday`]
        : []),
    ]
    navigator.clipboard?.writeText(lines.join('\n')).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-emphasis/60 backdrop-blur-sm px-4 py-6 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tour score"
    >
      <div
        className="animate-tour-pop border-neo shadow-neo-lg bg-paper text-ink w-full max-w-md my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-[3px] border-stroke px-5 py-3 bg-emphasis text-paper-static">
          <h2 className="font-display text-lg uppercase tracking-wider font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 stroke-[2.5]" />
            Tour Complete
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="border-neo-2 p-1.5 hover:bg-coral hover:text-ink-static transition-colors"
          >
            <X className="h-3.5 w-3.5 stroke-[3]" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Big total */}
          <NeoCard tone="coral" shadow="md" className="p-5 text-center">
            <div className="font-display text-[10px] uppercase tracking-[0.2em] font-bold">
              Day #{dayNumber(date)} · Tour score
            </div>
            <div className="font-display text-5xl font-bold mt-1 leading-none tabular-nums">
              {animatedTotal}
            </div>
            {delta != null && (
              <div className="mt-3 inline-flex">
                <span
                  className={cn(
                    'border-neo-2 px-2.5 py-1 font-display text-[11px] uppercase tracking-wider font-bold',
                    delta >= 0
                      ? 'bg-lime text-ink-static'
                      : 'bg-paper text-ink',
                  )}
                >
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs yesterday
                </span>
              </div>
            )}
          </NeoCard>

          {/* Per-game breakdown */}
          <div className="flex flex-col gap-2">
            {breakdown.perGame.map((g) => {
              const before = prevPerGame.get(g.gameType)
              const gDelta = before != null ? g.score - before : null
              return (
                <div
                  key={g.gameType}
                  className="flex items-center gap-3 border-neo-2 bg-cream-soft px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-xs uppercase tracking-wider font-bold">
                      {g.label}
                    </div>
                    <div className="text-[10px] text-ink-soft uppercase tracking-wider">
                      {g.detail}
                    </div>
                  </div>
                  {gDelta != null && gDelta !== 0 && (
                    <span
                      className={cn(
                        'font-display text-[10px] font-bold tabular-nums',
                        gDelta > 0 ? 'text-lime-deep' : 'text-coral',
                      )}
                    >
                      {gDelta > 0 ? '▲' : '▼'}
                      {Math.abs(gDelta)}
                    </span>
                  )}
                  <div className="font-display text-sm font-bold tabular-nums w-12 text-right">
                    {g.score}
                  </div>
                </div>
              )
            })}
          </div>

          {!prev && (
            <div className="border-neo-2 border-dashed bg-cream-soft px-3 py-2 text-center text-[11px] text-ink-soft uppercase tracking-wider font-display">
              First tour logged — play again tomorrow to compare.
            </div>
          )}

          <div className="text-center font-display text-sm uppercase tracking-wider font-bold text-coral">
            Come back tomorrow and beat this score!
          </div>

          <div className="flex items-center justify-center gap-3">
            <NeoButton tone="mustard" size="sm" onClick={onShare}>
              <Share2 className="inline h-3 w-3 mr-1" />
              {copied ? 'Copied!' : 'Share score'}
            </NeoButton>
            <NeoButton tone="paper" size="sm" onClick={onClose}>
              Done
            </NeoButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// Count from 0 → target over `duration` ms with an ease-out curve.
function useCountUp(target: number, duration: number): number {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    startRef.current = null
    let raf = 0
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t
      const elapsed = t - startRef.current
      const p = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}
