import { GuessSlots } from '../components/ui/GuessSlots'
import { GuestBanner } from '../components/ui/GuestBanner'
import { ScreenEffects } from '../components/ui/ScreenEffects'
import { InfoButton } from '../components/ui/InfoButton'
import { PuzzleSkeleton } from '../components/ui/PuzzleSkeleton'
import { GameSearch } from '../components/game/GameSearch'
import { GuessRow } from '../components/game/GuessRow'
import { AnswerReveal } from '../components/game/AnswerReveal'
import { SoundtrackPlayer } from '../components/game/SoundtrackPlayer'
import { useGameState } from '../hooks/useGameState'
import { useSoundtrackPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'
import { sharesFranchise } from '../lib/franchise'

const TOTAL_GUESSES = 6

export function SoundtrackGame() {
  const date = todayISO()
  const puzzle = useSoundtrackPuzzle(date)
  if (!puzzle) return <PuzzleSkeleton variant="soundtrack" />
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
    if (g.kind === 'wrong' && sharesFranchise(g.game, puzzle.game)) return 'close'
    return 'wrong'
  }) as ('empty' | 'wrong' | 'close' | 'correct' | 'active')[]

  const reversedGuesses = [...game.guesses].reverse()

  return (
    <div className="flex flex-col gap-4">
      <ScreenEffects
        type={puzzle.effectType}
        emoji={puzzle.effectEmoji}
        color={puzzle.effectColor}
        active={finished}
      />
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl uppercase tracking-wider font-bold">
          Soundtrack
        </h1>
        <InfoButton
          title="Soundtrack"
          text="A 1-second snippet plays first. Each wrong guess unlocks more: 4s, 8s, 15s, 30s, then the full track. Solve it as soon as you can hum along."
        />
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:items-start">
        <div className="md:flex-1 md:min-w-0 flex flex-col gap-4">
          <div className="relative overflow-hidden">
            {(puzzle.bannerText || puzzle.submitter) && finished && (
              <GuestBanner
                gameType="soundtrack"
                submitter={puzzle.submitter}
                text={puzzle.bannerText}
                color={puzzle.bannerColor}
              />
            )}
            <SoundtrackPlayer
              audioUrl={puzzle.audio_url}
              revealStart={puzzle.reveal_start_seconds}
              unlockStep={Math.min(game.wrongCount, TOTAL_GUESSES - 1)}
              trackTitle={puzzle.track_title}
              finished={finished}
            />
          </div>

          {!finished && (
            <GameSearch
              placeholder="Name the game…"
              onGuess={game.submitGuess}
              onSkip={game.submitSkip}
              direction="down"
            />
          )}

          <div className="flex items-center gap-3">
            <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
              Guesses
            </span>
            <GuessSlots total={TOTAL_GUESSES} states={slotStates} />
          </div>
        </div>

        <div className="md:w-[300px] shrink-0 flex flex-col gap-2">
          {finished && (
            <AnswerReveal
              game={puzzle.game}
              coverUrl={puzzle.cover_url}
              status={game.status === 'solved' ? 'solved' : 'lost'}
              guessCount={game.guesses.length}
              shareTone="mustard"
            />
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
    </div>
  )
}
