import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NeoCard } from '../components/ui/NeoCard'
import { TagPill } from '../components/ui/TagPill'
import { GuessSlots } from '../components/ui/GuessSlots'
import { InfoButton } from '../components/ui/InfoButton'
import { GameSearch } from '../components/game/GameSearch'
import { GuessRow } from '../components/game/GuessRow'
import { useGameState } from '../hooks/useGameState'
import { useScreenshotPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'
import { sharesFranchise } from '../lib/franchise'
import { cn } from '../lib/cn'

const TOTAL_GUESSES = 6

export function ScreenshotGame() {
  const date = todayISO()
  const puzzle = useScreenshotPuzzle(date)
  if (!puzzle) return <div className="text-sm text-ink-soft">Loading puzzle…</div>
  return <ScreenshotInner key={puzzle.id} puzzle={puzzle} date={date} />
}

function ScreenshotInner({
  puzzle,
  date,
}: {
  puzzle: NonNullable<ReturnType<typeof useScreenshotPuzzle>>
  date: string
}) {
  const game = useGameState({
    date,
    gameType: 'screenshot',
    totalGuesses: TOTAL_GUESSES,
    answerGameId: puzzle.game.id,
  })

  const visibleStep = Math.min(game.wrongCount, TOTAL_GUESSES - 1)
  const finished = game.status !== 'playing'
  const maxIndex = finished ? TOTAL_GUESSES - 1 : visibleStep

  // Track which still the player is looking at. Defaults to the latest
  // revealed image; auto-advances when a new wrong guess unlocks the next,
  // but only if the player was already viewing the most recent image — so
  // someone scrubbed back to an earlier still isn't yanked forward.
  const [galleryIndex, setGalleryIndex] = useState<number>(visibleStep)
  const [prevMaxIndex, setPrevMaxIndex] = useState<number>(maxIndex)
  if (prevMaxIndex !== maxIndex) {
    setPrevMaxIndex(maxIndex)
    if (galleryIndex === prevMaxIndex) setGalleryIndex(maxIndex)
  }

  const clampedIndex = Math.min(galleryIndex, maxIndex)
  const currentImage = puzzle.image_urls[clampedIndex]
  const canPrev = clampedIndex > 0
  const canNext = clampedIndex < maxIndex

  const slotStates = Array.from({ length: TOTAL_GUESSES }).map((_, i) => {
    const g = game.guesses[i]
    if (!g) return i === game.guesses.length ? 'active' : 'empty'
    if (g.kind === 'correct') return 'correct'
    if (g.kind === 'wrong' && sharesFranchise(g.game, puzzle.game)) return 'close'
    return 'wrong'
  }) as ('empty' | 'wrong' | 'close' | 'correct' | 'active')[]

  const reversedGuesses = [...game.guesses].reverse()

  return (
    <div className="flex flex-col gap-4 md:flex-1 md:min-h-0">
      <div className="flex flex-col md:flex-row gap-4 md:flex-1 md:min-h-0">
        <NeoCard
          tone="ink"
          shadow="md"
          className="p-0 overflow-hidden relative md:flex-1 md:min-h-0 min-w-0 flex"
        >
          <div className="relative w-full h-full bg-cream min-h-[260px]">
            <img
              src={currentImage}
              alt={`Puzzle still ${clampedIndex + 1}`}
              className="absolute inset-0 w-full h-full object-cover [image-rendering:pixelated]"
            />
            <InfoButton
              className="absolute top-3 right-3 z-20"
              title="Screenshot game"
              text="Guess today's game from six screenshots. Each wrong guess reveals a clearer, easier-to-identify image — see how few hints you need."
            />
            <button
              onClick={() => setGalleryIndex((i) => Math.max(0, Math.min(i, maxIndex) - 1))}
              disabled={!canPrev}
              className={cn(
                'absolute left-2 top-1/2 -translate-y-1/2 border-neo-2 bg-paper text-ink dark:bg-emphasis dark:text-paper-static p-2 shadow-neo-sm transition-all',
                canPrev
                  ? 'hover:-translate-x-[2px] hover:-translate-y-[calc(50%+2px)] hover:shadow-neo'
                  : 'opacity-30 cursor-not-allowed',
              )}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4 stroke-[3]" />
            </button>
            <button
              onClick={() => setGalleryIndex((i) => Math.min(maxIndex, Math.min(i, maxIndex) + 1))}
              disabled={!canNext}
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 border-neo-2 bg-paper text-ink dark:bg-emphasis dark:text-paper-static p-2 shadow-neo-sm transition-all',
                canNext
                  ? 'hover:-translate-x-[2px] hover:-translate-y-[calc(50%+2px)] hover:shadow-neo'
                  : 'opacity-30 cursor-not-allowed',
              )}
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4 stroke-[3]" />
            </button>
          </div>
        </NeoCard>

        <div className="md:w-[300px] shrink-0 flex flex-col gap-2 md:min-h-0 md:overflow-y-auto pr-1">
          {finished && (
            <NeoCard tone="paper" shadow="sm" className="p-3">
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
                Today's game was
              </div>
              {puzzle.cover_url && (
                <div className="mt-2 mx-auto w-[170px] border-neo bg-cream-soft overflow-hidden">
                  <img
                    src={puzzle.cover_url}
                    alt={`${puzzle.game.name} cover`}
                    className="w-full aspect-[2/3] object-cover"
                  />
                </div>
              )}
              <div className="font-display text-lg font-bold mt-2 leading-tight">
                {puzzle.game.name}
              </div>
              <div className="text-[11px] text-ink-soft mt-1 uppercase tracking-wider">
                {puzzle.game.year} · {puzzle.game.genre}
              </div>
              {game.status === 'solved' && (
                <div className="mt-2">
                  <TagPill tone="lime">
                    {`Solved in ${game.guesses.length}`}
                  </TagPill>
                </div>
              )}
            </NeoCard>
          )}

          {reversedGuesses.length === 0 ? (
            <div className="border-neo-2 border-dashed bg-cream-soft px-4 py-6 text-center">
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
                Past guesses
              </div>
              <div className="text-xs text-ink-soft mt-2">
                Your guesses will appear here.
              </div>
            </div>
          ) : (
            reversedGuesses.map((g, i) => (
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
          <GuessSlots
            total={TOTAL_GUESSES}
            states={slotStates}
            onSelect={(i) => setGalleryIndex(i)}
            clickableThrough={maxIndex}
            activeIndex={clampedIndex}
          />
        </div>
        <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
          Click guesses or use ← → to scrub stills
        </span>
      </div>
    </div>
  )
}
