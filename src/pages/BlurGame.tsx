import { useEffect, useState } from 'react'
import { NeoCard } from '../components/ui/NeoCard'
import { TagPill } from '../components/ui/TagPill'
import { GuessSlots } from '../components/ui/GuessSlots'
import { GuestBanner } from '../components/ui/GuestBanner'
import { InfoButton } from '../components/ui/InfoButton'
import { PuzzleSkeleton } from '../components/ui/PuzzleSkeleton'
import { GameSearch } from '../components/game/GameSearch'
import { GuessRow } from '../components/game/GuessRow'
import { AnswerReveal } from '../components/game/AnswerReveal'
import { useGameState } from '../hooks/useGameState'
import { useBlurPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'
import { BLUR_LEVELS_PX } from '../lib/types'
import { sharesFranchise } from '../lib/franchise'

const TOTAL_GUESSES = 6
const BASE_COVER_WIDTH_PX = 520

// Browser zoom shrinks every CSS pixel uniformly, so a fixed-width
// cover still looks smaller at 90% zoom than at 100%. We compensate by
// reading the zoom level (outerWidth / innerWidth — unaffected by Windows
// display scaling, only by browser zoom) and multiplying the cover width by
// its inverse. Result: at any zoom level the cover renders at roughly the
// same physical size on a given monitor. Clamped so extreme zoom-out doesn't
// blow the layout out of the right column.
function useBrowserZoomCompensation(): number {
  const [comp, setComp] = useState(1)
  useEffect(() => {
    function update() {
      const ratio = window.outerWidth / window.innerWidth
      // ratio < 1 means the user has zoomed OUT (innerWidth grew). We want
      // a bigger cover then, so divide. Clamp into [0.7, 1.6] to keep the
      // layout sane at extreme zoom levels.
      const raw = ratio > 0 ? 1 / ratio : 1
      setComp(Math.max(0.7, Math.min(1.6, raw)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return comp
}

export function BlurGame() {
  const date = todayISO()
  const puzzle = useBlurPuzzle(date)
  if (!puzzle) return <PuzzleSkeleton variant="blur" />
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

  const zoomComp = useBrowserZoomCompensation()
  const coverWidthPx = Math.round(BASE_COVER_WIDTH_PX * zoomComp)

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
            style={{ '--blur-cover-w': `${coverWidthPx}px` } as React.CSSProperties}
            className="p-0 overflow-hidden relative aspect-[3/4] w-full max-w-[440px] mx-auto md:w-[var(--blur-cover-w)] md:max-w-[var(--blur-cover-w)] md:mx-0 md:shrink-0"
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
              {puzzle.submitter && finished && (
                <GuestBanner name={puzzle.submitter} gameType="blur" />
              )}
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
            <AnswerReveal
              game={puzzle.game}
              status={game.status === 'solved' ? 'solved' : 'lost'}
              guessCount={game.guesses.length}
              shareTone="blue"
            />
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
