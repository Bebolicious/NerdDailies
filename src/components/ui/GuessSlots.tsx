import { ArrowRight, X } from 'lucide-react'
import { cn } from '../../lib/cn'

type GuessState = 'empty' | 'wrong' | 'close' | 'correct' | 'active'

type Props = {
  total: number
  states: GuessState[]
  // When set, non-empty slots up to `clickableThrough` (inclusive) are
  // interactive and trigger `onSelect(i)`. Used by the screenshot game to
  // scrub between revealed images.
  onSelect?: (i: number) => void
  clickableThrough?: number
  activeIndex?: number
}

export function GuessSlots({
  total,
  states,
  onSelect,
  clickableThrough,
  activeIndex,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const state = states[i] ?? 'empty'
        const isInteractive =
          onSelect !== undefined &&
          state !== 'empty' &&
          (clickableThrough === undefined || i <= clickableThrough)
        const isSelected = activeIndex === i
        const className = cn(
          'h-8 w-8 border-neo-2 flex items-center justify-center',
          state === 'empty' && 'bg-cream-soft',
          state === 'wrong' && 'bg-coral text-ink-static',
          state === 'close' && 'bg-mustard text-ink-static',
          state === 'correct' && 'bg-lime text-ink-static',
          state === 'active' && 'bg-paper relative',
          isInteractive && 'cursor-pointer hover:-translate-y-[1px] transition-transform',
          isSelected && 'outline outline-2 outline-offset-2 outline-ink',
        )
        const body = (
          <>
            {state === 'wrong' && <X className="h-5 w-5 stroke-[3]" />}
            {state === 'close' && <ArrowRight className="h-5 w-5 stroke-[3]" />}
            {state === 'correct' && (
              <span className="font-display text-base font-bold">★</span>
            )}
            {state === 'active' && (
              <span className="h-2 w-2 bg-ink rounded-full animate-pulse" />
            )}
          </>
        )
        if (isInteractive) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect!(i)}
              aria-label={`Show image ${i + 1}`}
              aria-pressed={isSelected}
              className={className}
            >
              {body}
            </button>
          )
        }
        return (
          <div key={i} className={className}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
