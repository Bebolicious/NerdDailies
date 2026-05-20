import { Share2 } from 'lucide-react'
import { NeoCard } from '../components/ui/NeoCard'
import { NeoButton } from '../components/ui/NeoButton'
import { TagPill } from '../components/ui/TagPill'
import { GuessSlots } from '../components/ui/GuessSlots'
import { InfoButton } from '../components/ui/InfoButton'
import { GameSearch } from '../components/game/GameSearch'
import { GuessRow } from '../components/game/GuessRow'
import { useGameState } from '../hooks/useGameState'
import { useBlurPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'
import { BLUR_LEVELS_PX } from '../lib/types'
import { sharesFranchise } from '../lib/franchise'

const TOTAL_GUESSES = 6

export function BlurGame() {
  const date = todayISO()
  const puzzle = useBlurPuzzle(date)
  if (!puzzle) return <div className="text-sm text-ink-soft">Loading puzzle…</div>
  return <BlurInner key={puzzle.id} puzzle={puzzle} date={date} />
}

function BlurInner({
  puzzle,
  date,
}: {
  puzzle: NonNullable<ReturnType<typeof useBlurPuzzle>>
  date: string
}) {
  const game = useGameState({
    date,
    gameType: 'blur',
    totalGuesses: TOTAL_GUESSES,
    answerGameId: puzzle.game.id,
  })

  const finished = game.status !== 'playing'
  const stepIndex = Math.min(game.wrongCount, BLUR_LEVELS_PX.length - 1)
  const blurPx = finished ? 0 : BLUR_LEVELS_PX[stepIndex]

  const slotStates = Array.from({ length: TOTAL_GUESSES }).map((_, i) => {
    const g = game.guesses[i]
    if (!g) return i === game.guesses.length ? 'active' : 'empty'
    if (g.kind === 'correct') return 'correct'
    if (g.kind === 'wrong' && sharesFranchise(g.game, puzzle.game)) return 'close'
    return 'wrong'
  }) as ('empty' | 'wrong' | 'close' | 'correct' | 'active')[]

  return (
    <div className="flex flex-col gap-4 md:flex-1 md:min-h-0">
      <div className="flex flex-col md:flex-row gap-4 md:flex-1 md:min-h-0">
        <div className="md:flex-1 md:min-h-0 min-w-0 flex md:items-center md:justify-center md:py-2">
          <NeoCard
            tone="ink"
            shadow="md"
            className="p-0 overflow-hidden relative aspect-[3/4] w-full max-w-[360px] mx-auto md:h-full md:w-auto md:max-w-full md:max-h-full md:mx-0"
          >
            <div className="relative w-full h-full bg-cream overflow-hidden">
              <img
                src={puzzle.cover_url}
                alt="Mystery game cover"
                className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 ease-out"
                style={{
                  filter: `blur(${blurPx}px)`,
                  transform: blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
                }}
              />
              <InfoButton
                className="absolute top-3 right-3 z-20"
                title="Blur Reveal"
                text="Guess today's game from its blurred cover. Each wrong guess sharpens the image — fewer guesses, fewer pixels of mercy."
              />
              <div className="absolute bottom-3 left-3 z-20">
                <TagPill tone="paper">
                  {finished
                    ? 'Fully revealed'
                    : `Blur · ${blurPx}px`}
                </TagPill>
              </div>
            </div>
          </NeoCard>
        </div>

        <div className="md:w-[300px] shrink-0 flex flex-col gap-2 md:min-h-0 md:overflow-y-auto pr-1">
          {finished && (
            <NeoCard tone="paper" shadow="sm" className="p-3">
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
                Today's game was
              </div>
              <div className="font-display text-lg font-bold mt-2 leading-tight">
                {puzzle.game.name}
              </div>
              <div className="text-[11px] text-ink-soft mt-1 uppercase tracking-wider">
                {puzzle.game.year} · {puzzle.game.genre}
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <TagPill tone={game.status === 'solved' ? 'lime' : 'coral'}>
                  {game.status === 'solved'
                    ? `Solved in ${game.guesses.length}`
                    : 'Streak broken'}
                </TagPill>
                <NeoButton tone="blue" size="sm">
                  <Share2 className="inline h-3 w-3 mr-1" /> Share
                </NeoButton>
              </div>
            </NeoCard>
          )}

          {game.guesses.length === 0 ? (
            <div className="border-neo-2 border-dashed bg-cream-soft px-4 py-6 text-center">
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
                Past guesses
              </div>
              <div className="text-xs text-ink-soft mt-2">
                Your guesses will appear here.
              </div>
            </div>
          ) : (
            [...game.guesses].reverse().map((g, i) => (
              <GuessRow
                key={game.guesses.length - 1 - i}
                guess={g}
                hintSameYear={puzzle.game.year}
                hintAnswer={puzzle.game}
              />
            ))
          )}
        </div>
      </div>

      {!finished && (
        <GameSearch
          disabled={game.status !== 'playing'}
          onGuess={game.submitGuess}
          onSkip={game.submitSkip}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
            Guesses
          </span>
          <GuessSlots total={TOTAL_GUESSES} states={slotStates} />
        </div>
        <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
          Sharper after every miss
        </span>
      </div>
    </div>
  )
}
