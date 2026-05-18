import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

type GuessState = 'empty' | 'wrong' | 'correct' | 'active'

type Props = {
  total: number
  states: GuessState[]
}

export function GuessSlots({ total, states }: Props) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const state = states[i] ?? 'empty'
        return (
          <div
            key={i}
            className={cn(
              'h-8 w-8 border-neo-2 flex items-center justify-center',
              state === 'empty' && 'bg-cream-soft',
              state === 'wrong' && 'bg-coral text-ink-static',
              state === 'correct' && 'bg-lime text-ink-static',
              state === 'active' && 'bg-paper relative',
            )}
          >
            {state === 'wrong' && <X className="h-5 w-5 stroke-[3]" />}
            {state === 'correct' && (
              <span className="font-display text-base font-bold">★</span>
            )}
            {state === 'active' && (
              <span className="h-2 w-2 bg-ink rounded-full animate-pulse" />
            )}
          </div>
        )
      })}
    </div>
  )
}
