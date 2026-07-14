import { useEffect, useReducer, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TourAskModal } from './TourAskModal'
import { TourContinueModal } from './TourContinueModal'
import { TourScoreModal } from './TourScoreModal'
import { useTour } from '../../hooks/useTour'
import { useTourPrompt } from '../../hooks/useTourPrompt'
import { todayISO } from '../../lib/dates'
import { getResult } from '../../lib/scoreStore'
import { hasGuessedToday } from '../../lib/dailyActivity'
import {
  fetchBlurPuzzle,
  fetchScreenshotPuzzle,
  fetchSoundtrackPuzzle,
  fetchTrophyPuzzle,
} from '../../lib/puzzleStore'
import {
  connectionsStarted,
  isTourComplete,
  scoreTourGame,
  TOUR_GAMES,
  TOUR_PATHS,
  type TourGame,
} from '../../lib/tourScore'
import { TOUR_REQUEST_EVENT } from '../../lib/tourState'
import type { Game, PuzzleDecor } from '../../lib/types'

// The single answer games (everything except the connections finale). Only
// these show the "continue" reveal popup.
const SINGLE_ANSWER: TourGame[] = ['screenshot', 'trophy', 'blur', 'soundtrack']

function pathToTourGame(pathname: string): TourGame | null {
  const entry = (Object.keys(TOUR_PATHS) as TourGame[]).find(
    (g) => pathname.startsWith(TOUR_PATHS[g]),
  )
  return entry ?? null
}

type Answer = { game: Game; coverUrl?: string; decor: PuzzleDecor }

// The puzzle objects are already `& PuzzleDecor`, so lift the banner fields the
// continue popup renders (submitter / custom banner).
function pickDecor(p: PuzzleDecor): PuzzleDecor {
  return {
    submitter: p.submitter,
    bannerText: p.bannerText,
    bannerColor: p.bannerColor,
    bannerTextColor: p.bannerTextColor,
    bannerStyle: p.bannerStyle,
  }
}

async function fetchTourAnswer(
  game: TourGame,
  date: string,
): Promise<Answer | null> {
  switch (game) {
    case 'screenshot': {
      const p = await fetchScreenshotPuzzle(date)
      return { game: p.game, coverUrl: p.cover_url, decor: pickDecor(p) }
    }
    case 'trophy': {
      const p = await fetchTrophyPuzzle(date)
      return { game: p.game, coverUrl: p.cover_url, decor: pickDecor(p) }
    }
    case 'blur': {
      const p = await fetchBlurPuzzle(date)
      return { game: p.game, coverUrl: p.cover_url, decor: pickDecor(p) }
    }
    case 'soundtrack': {
      const p = await fetchSoundtrackPuzzle(date)
      return { game: p.game, coverUrl: p.cover_url, decor: pickDecor(p) }
    }
    default:
      return null
  }
}

// Global tour orchestrator, mounted once inside ShellLayout. Decides which of
// the three tour popups (ask / continue / score) should be visible based on the
// per-day tour state, the current route, and which games have finished.
export function TourController() {
  const date = todayISO()
  const location = useLocation()
  const navigate = useNavigate()
  const tour = useTour(date)
  const { enabled: promptEnabled, setEnabled: setPromptEnabled } =
    useTourPrompt()

  // Force a re-read of localStorage-backed results when a game finalizes.
  const [, bump] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    window.addEventListener('dailies:result-saved', bump)
    return () => window.removeEventListener('dailies:result-saved', bump)
  }, [])

  const currentGame = pathToTourGame(location.pathname)

  // ── Score finale ──
  const connectionsFinished = isTourComplete(date)
  const showScore =
    tour.isActive &&
    connectionsFinished &&
    !tour.acknowledged.includes('connections')

  // ── Continue step ──
  const continueGame =
    tour.isActive &&
    currentGame &&
    SINGLE_ANSWER.includes(currentGame) &&
    !!getResult(date, currentGame) &&
    !tour.acknowledged.includes(currentGame) &&
    !showScore
      ? currentGame
      : null

  const [answer, setAnswer] = useState<Answer | null>(null)
  // Drop a stale answer the moment the target game changes (render-phase reset),
  // so a previous game's cover can't flash before the new fetch resolves.
  const [answerFor, setAnswerFor] = useState<TourGame | null>(null)
  if (answerFor !== continueGame) {
    setAnswerFor(continueGame)
    setAnswer(null)
  }
  useEffect(() => {
    if (!continueGame) return
    let cancelled = false
    fetchTourAnswer(continueGame, date).then((a) => {
      if (!cancelled) setAnswer(a)
    })
    return () => {
      cancelled = true
    }
  }, [continueGame, date])

  // ── Ask prompt ──
  // Suppress once the player has made any guess today (marker set on the first
  // guess/skip, plus finished/started games as a fallback for pre-marker days).
  // "Not today" only dismisses for the session (below), so a refresh re-asks —
  // only "Hide this popup" (prompt setting) or an actual guess suppresses it.
  const played =
    hasGuessedToday(date) ||
    TOUR_GAMES.some((g) =>
      g === 'connections' ? connectionsStarted(date) : !!getResult(date, g),
    )
  const [dismissed, setDismissed] = useState(false)

  // The sidebar CTA can force the invite open regardless of the auto-prompt
  // gates (already played, dismissed this session, prompt setting off, …).
  const [forceAsk, setForceAsk] = useState(false)
  useEffect(() => {
    const open = () => setForceAsk(true)
    window.addEventListener(TOUR_REQUEST_EVENT, open)
    return () => window.removeEventListener(TOUR_REQUEST_EVENT, open)
  }, [])

  const showAsk =
    forceAsk ||
    (promptEnabled && tour.status === 'unanswered' && !played && !dismissed)

  // ── Handlers ──
  function onAccept() {
    setForceAsk(false)
    tour.accept()
    navigate(TOUR_PATHS[TOUR_GAMES[0]])
  }

  function onContinue() {
    if (!continueGame) return
    const index = TOUR_GAMES.indexOf(continueGame)
    const next = TOUR_GAMES[index + 1]
    tour.acknowledge(continueGame)
    setAnswer(null)
    if (next) navigate(TOUR_PATHS[next])
  }

  if (showAsk) {
    return (
      <TourAskModal
        onAccept={onAccept}
        onDecline={() => {
          setForceAsk(false)
          setDismissed(true)
        }}
        onHide={() => {
          setForceAsk(false)
          setPromptEnabled(false)
        }}
      />
    )
  }

  if (showScore) {
    return <TourScoreModal date={date} onClose={tour.complete} />
  }

  if (continueGame && answer) {
    return (
      <TourContinueModal
        game={answer.game}
        coverUrl={answer.coverUrl}
        decor={answer.decor}
        gameType={continueGame}
        score={scoreTourGame(date, continueGame)}
        onContinue={onContinue}
      />
    )
  }

  return null
}
