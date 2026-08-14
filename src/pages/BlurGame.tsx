import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { BlurBackAskModal } from '../components/game/BlurBackAskModal'
import { useGameState } from '../hooks/useGameState'
import { useBlurPuzzle } from '../hooks/usePuzzle'
import { todayISO } from '../lib/dates'
import { BLUR_LEVELS_PX, BLUR_BACK_LEVELS_PX } from '../lib/types'
import type { BlurPuzzle, Game, GameType } from '../lib/types'
import { sharesFranchise } from '../lib/franchise'
import { wasBackCoverAsked, markBackCoverAsked } from '../lib/blurBackPrompt'
import { getResult } from '../lib/scoreStore'
import { loadTour } from '../lib/tourState'

const TOTAL_GUESSES = 5
const BASE_COVER_WIDTH_PX = 520

// Back Cover has no tab or nav entry of its own — the only ways in are the
// post-round invite modal and the hard-mode tile on the sidebar's Blur card.
export const BLUR_BACK_PATH = '/blur/back'

type Mode = 'front' | 'back'

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

// Mounted by the `/blur/*` splat route, so switching between the front round
// and Back Cover hard mode keeps this component mounted and the puzzle row is
// fetched exactly once per visit. Two sibling routes would re-run the query on
// every mode switch — `puzzleStore` has no cache layer.
export function BlurGame() {
  const date = todayISO()
  const puzzle = useBlurPuzzle(date)
  const location = useLocation()
  const mode: Mode = location.pathname.startsWith(BLUR_BACK_PATH)
    ? 'back'
    : 'front'

  if (!puzzle) return <PuzzleSkeleton variant="blur" />
  return <BlurModes key={puzzle.id} puzzle={puzzle} date={date} mode={mode} />
}

function BlurModes({
  puzzle,
  date,
  mode,
}: {
  puzzle: BlurPuzzle
  date: string
  mode: Mode
}) {
  const navigate = useNavigate()
  const hasBack = !!puzzle.back
  // A deep link to /blur/back on a day with no hard mode falls back to the
  // front round rather than rendering an empty page.
  const effectiveMode: Mode = mode === 'back' && hasBack ? 'back' : 'front'

  // Reading the front round's outcome from the result store (rather than
  // plumbing a callback out of it) means a player who finished earlier today
  // still gets the invite on their next visit — the store is already rehydrated.
  const frontStatus = useRoundStatus(date, 'blur')

  // Both are per-day facts that only this component changes, so a mount-time
  // read is enough and keeps the open/closed decision a pure render.
  const [alreadyAsked, setAlreadyAsked] = useState(() =>
    wasBackCoverAsked(date),
  )
  // The Tour drives its own continue modal off the same finish event — two
  // stacked popups mid-run is worse than waiting. Hard mode stays reachable
  // from the sidebar tile once the run is over.
  const [tourActive] = useState(() => loadTour(date)?.status === 'active')

  const askOpen =
    hasBack &&
    frontStatus !== 'unplayed' &&
    effectiveMode === 'front' &&
    !alreadyAsked &&
    !tourActive

  function acceptBack() {
    markBackCoverAsked(date)
    setAlreadyAsked(true)
    navigate(BLUR_BACK_PATH)
  }

  function declineBack() {
    markBackCoverAsked(date)
    setAlreadyAsked(true)
  }

  return (
    <>
      {/* askOpen already narrows frontStatus to a finished outcome. */}
      {askOpen && (
        <BlurBackAskModal
          frontStatus={frontStatus}
          onAccept={acceptBack}
          onDecline={declineBack}
        />
      )}

      {/* The `key` is load-bearing, not decoration. Both branches render the
          same component type at the same tree position, so without it React
          reuses the instance across a mode switch — and `useGameState` only
          reads the stored result in its useState initializers, which run on
          mount. The front round's solved state would carry straight into the
          back round and hand the player a win they never played for. */}
      {effectiveMode === 'back' && puzzle.back ? (
        <BlurRound
          key="blurback"
          date={date}
          gameType="blurback"
          answer={puzzle.back.game}
          coverUrl={puzzle.back.cover_url}
          variant="back"
          decor={puzzle}
        />
      ) : (
        <BlurRound
          key="blur"
          date={date}
          gameType="blur"
          answer={puzzle.game}
          coverUrl={puzzle.cover_url}
          variant="front"
          decor={puzzle}
        />
      )}
    </>
  )
}

type RoundStatus = 'unplayed' | 'solved' | 'lost'

// Reads a round's saved result, refreshing on the same event every other
// surface listens to — so both the invite and the "New" chip react the moment
// a round resolves, without either round having to report upward.
function useRoundStatus(
  date: string,
  gameType: Extract<GameType, 'blur' | 'blurback'>,
): RoundStatus {
  const read = useCallback((): RoundStatus => {
    const r = getResult(date, gameType)
    if (!r) return 'unplayed'
    return r.status === 'solved' ? 'solved' : 'lost'
  }, [date, gameType])
  const [status, setStatus] = useState(read)
  useEffect(() => {
    function refresh() {
      setStatus(read())
    }
    window.addEventListener('dailies:result-saved', refresh)
    return () => window.removeEventListener('dailies:result-saved', refresh)
  }, [read])
  return status
}

// One round of Blur Reveal. The front round and Back Cover hard mode are the
// same game with a different image, answer and result key — so they're the same
// component, parameterized.
function BlurRound({
  date,
  gameType,
  answer,
  coverUrl,
  variant,
  decor,
}: {
  date: string
  gameType: Extract<GameType, 'blur' | 'blurback'>
  answer: Game
  coverUrl: string
  variant: Mode
  decor: BlurPuzzle
}) {
  const game = useGameState({
    date,
    gameType,
    totalGuesses: TOTAL_GUESSES,
    answerGameId: answer.id,
  })

  const isBack = variant === 'back'

  const finished = game.status !== 'playing'
  const levels = isBack ? BLUR_BACK_LEVELS_PX : BLUR_LEVELS_PX
  const stepIndex = Math.min(game.wrongCount, levels.length - 1)
  const blurPx = finished ? 0 : levels[stepIndex]

  const zoomComp = useBrowserZoomCompensation()
  const coverWidthPx = Math.round(BASE_COVER_WIDTH_PX * zoomComp)

  const slotStates = Array.from({ length: TOTAL_GUESSES }).map((_, i) => {
    const g = game.guesses[i]
    if (!g) return i === game.guesses.length ? 'active' : 'empty'
    if (g.kind === 'correct') return 'correct'
    if (g.kind === 'wrong' && sharesFranchise(g.game, answer)) return 'close'
    return 'wrong'
  }) as ('empty' | 'wrong' | 'close' | 'correct' | 'active')[]

  return (
    <div className="flex flex-col gap-4 md:flex-1 md:min-h-0">
      <ScreenEffects
        type={decor.effectType}
        emoji={decor.effectEmoji}
        color={decor.effectColor}
        active={finished}
      />
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
                src={coverUrl}
                alt={isBack ? 'Mystery game back cover' : 'Mystery game cover'}
                className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 ease-out"
                style={{
                  filter: `blur(${blurPx}px)`,
                  transform: blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
                }}
              />
              <InfoButton
                className="absolute top-3 right-3 z-20"
                title={isBack ? 'Blur Reveal · Back Cover' : 'Blur Reveal'}
                text={
                  isBack
                    ? "Hard mode. Same rules — but you're guessing from the BACK of the box, and it's a different game from the front round. Each wrong guess sharpens the image."
                    : 'Guess today’s game from its blurred cover. Each wrong guess sharpens the image — fewer guesses, fewer pixels of mercy.'
                }
              />
              {isBack && (
                <div className="absolute top-3 left-3 z-20">
                  <TagPill tone="ink">Hard · Back cover</TagPill>
                </div>
              )}
              {/* The submitter/festive banner belongs to the day's puzzle, so
                  it shows on the front round only — hard mode is a bonus
                  round, not a second credit. */}
              {!isBack && (decor.bannerText || decor.submitter) && finished && (
                <GuestBanner
                  gameType="blur"
                  submitter={decor.submitter}
                  text={decor.bannerText}
                  color={decor.bannerColor}
                  textColor={decor.bannerTextColor}
                  style={decor.bannerStyle}
                />
              )}
              <div className="absolute bottom-3 left-3 z-20">
                <TagPill tone="paper">
                  {finished ? 'Fully revealed' : `Blur · ${blurPx}px`}
                </TagPill>
              </div>
            </div>
          </NeoCard>
        </div>

        <div className="md:w-[300px] shrink-0 flex flex-col gap-2 md:min-h-0 md:overflow-y-auto pr-1">
          {finished && (
            <AnswerReveal
              game={answer}
              coverUrl={coverUrl}
              status={game.status === 'solved' ? 'solved' : 'lost'}
              guessCount={game.guesses.length}
              shareTone="blue"
              shareLabel={isBack ? 'blur · back cover' : 'blur'}
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
                hintSameYear={answer.year}
                hintAnswer={answer}
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
