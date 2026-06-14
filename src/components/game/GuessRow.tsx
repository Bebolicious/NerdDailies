import { ArrowRight, X } from 'lucide-react'
import type { Game, Guess } from '../../lib/types'
import { sharesFranchise } from '../../lib/franchise'
import { cn } from '../../lib/cn'

export function GuessRow({
  guess,
  hintSameYear,
  hintAnswer,
}: {
  guess: Guess
  hintSameYear?: number
  hintAnswer?: Game
}) {
  if (guess.kind === 'skip') {
    return (
      <div className="border-neo-2 bg-cream-soft px-4 py-3 flex items-center justify-between">
        <span className="font-display text-xs uppercase tracking-wider text-ink-soft">
          Skipped
        </span>
      </div>
    )
  }
  const isCorrect = guess.kind === 'correct'
  const sameFranchise =
    !isCorrect && hintAnswer !== undefined && sharesFranchise(guess.game, hintAnswer)
  const sameYear =
    !isCorrect &&
    !sameFranchise &&
    hintSameYear !== undefined &&
    guess.game.year === hintSameYear
  return (
    <div
      className={cn(
        'border-neo-2 px-4 py-3 flex items-center gap-3',
        isCorrect
          ? 'bg-lime text-ink-static'
          : sameFranchise
            ? 'bg-mustard text-ink-static'
            : sameYear
              ? 'bg-mustard/40'
              : 'bg-pink-soft',
      )}
    >
      <div
        className={cn(
          'w-6 h-6 flex items-center justify-center shrink-0',
          isCorrect
            ? 'text-lime-deep'
            : sameFranchise
              ? 'text-mustard-deep'
              : sameYear
                ? 'text-mustard-deep'
                : 'text-coral-deep',
        )}
      >
        {isCorrect ? (
          <span className="font-display text-lg font-bold">★</span>
        ) : sameFranchise || sameYear ? (
          <ArrowRight className="h-5 w-5 stroke-[3]" />
        ) : (
          <X className="h-5 w-5 stroke-[3]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm uppercase tracking-wider font-bold truncate">
          {guess.game.name}
        </div>
        <div className="text-[11px] uppercase tracking-wider opacity-70">
          {guess.game.year ?? '—'} · {guess.game.genre ?? '—'}
        </div>
      </div>
      {(sameFranchise || sameYear) && (
        <span className="font-display text-[10px] uppercase tracking-wider font-bold">
          {sameFranchise ? 'Same franchise' : 'Same year'}
        </span>
      )}
    </div>
  )
}
