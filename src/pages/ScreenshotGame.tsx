import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NeoCard } from '../components/ui/NeoCard'
import { TagPill } from '../components/ui/TagPill'
import { GuessSlots } from '../components/ui/GuessSlots'
import { GameSearch } from '../components/game/GameSearch'
import { GuessRow } from '../components/game/GuessRow'
import { useGameState } from '../hooks/useGameState'
import { useScreenshotPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'

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
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const finished = game.status !== 'playing'
  const currentImage =
    finished && galleryIndex !== null
      ? puzzle.image_urls[galleryIndex]
      : puzzle.image_urls[visibleStep]

  const slotStates = Array.from({ length: TOTAL_GUESSES }).map((_, i) => {
    const g = game.guesses[i]
    if (!g) return i === game.guesses.length ? 'active' : 'empty'
    if (g.kind === 'correct') return 'correct'
    return 'wrong'
  }) as ('empty' | 'wrong' | 'correct' | 'active')[]

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
              alt={`Puzzle still ${visibleStep + 1}`}
              className="absolute inset-0 w-full h-full object-cover [image-rendering:pixelated]"
            />
            {finished && (
              <>
                <button
                  onClick={() =>
                    setGalleryIndex((i) =>
                      Math.max(0, (i ?? visibleStep) - 1),
                    )
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 border-neo-2 bg-emphasis text-paper-static p-2 shadow-neo-sm hover:-translate-x-[2px] hover:-translate-y-[calc(50%+2px)] hover:shadow-neo transition-all"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-4 w-4 stroke-[3]" />
                </button>
                <button
                  onClick={() =>
                    setGalleryIndex((i) =>
                      Math.min(5, (i ?? visibleStep) + 1),
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-neo-2 bg-emphasis text-paper-static p-2 shadow-neo-sm hover:-translate-x-[2px] hover:-translate-y-[calc(50%+2px)] hover:shadow-neo transition-all"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-4 w-4 stroke-[3]" />
                </button>
              </>
            )}
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
        {finished && (
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
            Click ← → on the image to see every still
          </span>
        )}
      </div>
    </div>
  )
}
