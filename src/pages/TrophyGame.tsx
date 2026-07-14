import { useState } from 'react'
import { Trophy as TrophyIcon } from 'lucide-react'
import { NeoCard } from '../components/ui/NeoCard'
import { TagPill } from '../components/ui/TagPill'
import { GuessSlots } from '../components/ui/GuessSlots'
import { GuestBanner } from '../components/ui/GuestBanner'
import { ScreenEffects } from '../components/ui/ScreenEffects'
import { InfoButton } from '../components/ui/InfoButton'
import { PuzzleSkeleton } from '../components/ui/PuzzleSkeleton'
import { GameSearch } from '../components/game/GameSearch'
import { GuessRow } from '../components/game/GuessRow'
import { AnswerReveal } from '../components/game/AnswerReveal'
import { useGameState } from '../hooks/useGameState'
import { useTrophyPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'
import { sharesFranchise } from '../lib/franchise'
import { cn } from '../lib/cn'

const TOTAL_GUESSES = 6

export function TrophyGame() {
  const date = todayISO()
  const puzzle = useTrophyPuzzle(date)
  if (!puzzle) return <PuzzleSkeleton variant="trophy" />
  return <TrophyInner key={puzzle.id} puzzle={puzzle} date={date} />
}

function TrophyInner({
  puzzle,
  date,
}: {
  puzzle: NonNullable<ReturnType<typeof useTrophyPuzzle>>
  date: string
}) {
  const game = useGameState({
    date,
    gameType: 'trophy',
    totalGuesses: TOTAL_GUESSES,
    answerGameId: puzzle.game.id,
  })

  // Pop the achievement card in only on the first visit of an unfinished
  // puzzle. Captured at mount so re-renders mid-game don't replay it.
  const [animateOnMount] = useState(() => game.status === 'playing')

  // Reveal cadence:
  //  wrongCount 0 -> name only
  //  wrongCount 1 -> +description
  //  wrongCount 2..5 -> + clue index (wrongCount - 2)
  const finished = game.status !== 'playing'
  const showDescription = game.wrongCount >= 1 || finished
  const visibleClues = Math.max(0, game.wrongCount - 1)

  const slotStates = Array.from({ length: TOTAL_GUESSES }).map((_, i) => {
    const g = game.guesses[i]
    if (!g) return i === game.guesses.length ? 'active' : 'empty'
    if (g.kind === 'correct') return 'correct'
    if (g.kind === 'wrong' && sharesFranchise(g.game, puzzle.game)) return 'close'
    return 'wrong'
  }) as ('empty' | 'wrong' | 'close' | 'correct' | 'active')[]

  const reversedGuesses = [...game.guesses].reverse()

  return (
    <div className="flex flex-col md:flex-row gap-4 md:items-start">
      <ScreenEffects
        type={puzzle.effectType}
        emoji={puzzle.effectEmoji}
        color={puzzle.effectColor}
        active={finished}
      />
      <div className="md:flex-1 md:min-w-0 flex flex-col gap-4">
        <NeoCard
          tone="ink"
          shadow="md"
          className={cn(
            'p-6 relative overflow-hidden',
            animateOnMount && 'animate-achievement-pop',
          )}
        >
          {(puzzle.bannerText || puzzle.submitter) && finished && (
            <GuestBanner
              gameType="trophy"
              submitter={puzzle.submitter}
              text={puzzle.bannerText}
              color={puzzle.bannerColor}
              textColor={puzzle.bannerTextColor}
              style={puzzle.bannerStyle}
            />
          )}
          <InfoButton
            className={cn(
              'absolute right-3 z-20',
              (puzzle.bannerText || puzzle.submitter) && finished
                ? 'top-20'
                : 'top-3',
            )}
            title="Trophy game"
            text="Guess today's game from one of its trophies. Your first wrong guess reveals the trophy's description; each guess after that unlocks an extra clue."
          />
          <div className="flex items-start gap-5">
            <NeoCard
              tone="mustard"
              shadow="sm"
              className="w-20 h-20 flex items-center justify-center shrink-0"
            >
              <TrophyIcon className="h-10 w-10 stroke-[2.5]" />
            </NeoCard>
            <div className="flex-1 min-w-0">
              <div className="font-display text-[10px] uppercase tracking-[0.25em] text-lime mb-2">
                Achievement unlocked · {puzzle.gamerscore ?? 0} gamerscore
              </div>
              <div className="font-display text-2xl font-bold leading-snug mb-2">
                {puzzle.trophy_name}
              </div>
              {showDescription ? (
                <div className="text-sm">{puzzle.trophy_description}</div>
              ) : (
                <div className="text-sm italic opacity-60">
                  Description revealed after your first wrong guess.
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {puzzle.rarity_pct !== undefined && (
                  <TagPill tone="lime">Rarity · {puzzle.rarity_pct}%</TagPill>
                )}
                {puzzle.platform && (
                  <TagPill tone="paper">Platform · {puzzle.platform}</TagPill>
                )}
              </div>
            </div>
          </div>
        </NeoCard>

        {!finished && (
          <GameSearch
            placeholder="What's the game?"
            onGuess={game.submitGuess}
            onSkip={game.submitSkip}
            direction="down"
          />
        )}

        <div>
          <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mb-2">
            Clues unlock per wrong guess
          </div>
          <div className="flex flex-col gap-2">
            {puzzle.clues.map((clue, i) => {
              const unlocked = i < visibleClues || finished
              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-3 border-neo-2 px-3 py-2',
                    unlocked ? 'bg-paper' : 'bg-cream-soft opacity-70',
                  )}
                >
                  <TagPill tone={unlocked ? 'lime' : 'paper'} className="text-[10px]">
                    #{i + 1}
                  </TagPill>
                  <span
                    className={cn(
                      'text-sm',
                      unlocked ? 'font-bold' : 'italic text-ink-soft',
                    )}
                  >
                    {unlocked ? clue : `Unlocks at guess ${i + 2}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

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
            shareTone="blue"
            shareLabel="trophy"
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
  )
}
