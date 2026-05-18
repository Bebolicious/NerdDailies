import { Share2 } from 'lucide-react'
import { NeoCard } from '../components/ui/NeoCard'
import { NeoButton } from '../components/ui/NeoButton'
import { TagPill } from '../components/ui/TagPill'
import { GuessSlots } from '../components/ui/GuessSlots'
import { GameSearch } from '../components/game/GameSearch'
import { GuessRow } from '../components/game/GuessRow'
import { SoundtrackPlayer } from '../components/game/SoundtrackPlayer'
import { useGameState } from '../hooks/useGameState'
import { useSoundtrackPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'

const TOTAL_GUESSES = 6

export function SoundtrackGame() {
  const date = todayISO()
  const puzzle = useSoundtrackPuzzle(date)
  if (!puzzle) return <div className="text-sm text-ink-soft">Loading puzzle…</div>
  return <SoundtrackInner key={puzzle.id} puzzle={puzzle} date={date} />
}

function SoundtrackInner({
  puzzle,
  date,
}: {
  puzzle: NonNullable<ReturnType<typeof useSoundtrackPuzzle>>
  date: string
}) {
  const game = useGameState({
    date,
    gameType: 'soundtrack',
    totalGuesses: TOTAL_GUESSES,
    answerGameId: puzzle.game.id,
  })

  const finished = game.status !== 'playing'

  const slotStates = Array.from({ length: TOTAL_GUESSES }).map((_, i) => {
    const g = game.guesses[i]
    if (!g) return i === game.guesses.length ? 'active' : 'empty'
    if (g.kind === 'correct') return 'correct'
    return 'wrong'
  }) as ('empty' | 'wrong' | 'correct' | 'active')[]

  return (
    <div className="max-w-3xl">
      <SoundtrackPlayer
        audioUrl={puzzle.audio_url}
        revealStart={puzzle.reveal_start_seconds}
        unlockStep={Math.min(game.wrongCount, TOTAL_GUESSES - 1)}
        trackTitle={puzzle.track_title}
        finished={finished}
      />

      {!finished && (
        <div className="mt-5">
          <GameSearch
            placeholder="Name the game…"
            onGuess={game.submitGuess}
            onSkip={game.submitSkip}
          />
        </div>
      )}

      {finished && (
        <NeoCard tone="paper" shadow="md" className="mt-5 p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
                Today's game was
              </div>
              <div className="font-display text-2xl font-bold leading-tight">
                {puzzle.game.name}
              </div>
              <div className="text-xs text-ink-soft mt-1 uppercase tracking-wider">
                {puzzle.game.year} · {puzzle.game.genre}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <TagPill tone={game.status === 'solved' ? 'lime' : 'coral'}>
                {game.status === 'solved'
                  ? `Solved in ${game.guesses.length}`
                  : 'Streak broken'}
              </TagPill>
              <NeoButton tone="mustard" size="sm">
                <Share2 className="inline h-3 w-3 mr-1" /> Share
              </NeoButton>
            </div>
          </div>
        </NeoCard>
      )}

      {game.guesses.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {game.guesses.map((g, i) => (
            <GuessRow key={i} guess={g} hintSameYear={puzzle.game.year} />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
          Guesses
        </span>
        <GuessSlots total={TOTAL_GUESSES} states={slotStates} />
      </div>
    </div>
  )
}
