import { getResult } from './scoreStore'
import {
  CONNECTIONS_GROUP_COUNT,
  CONNECTIONS_MAX_MISTAKES,
  type GameType,
  type PuzzleResult,
} from './types'

// ── The Tour ─────────────────────────────────────────────────────────────────
//
// A once-a-day guided run through the five DAILY games in a fixed order. Every
// game contributes points based on how efficiently it was solved; the total is
// the "tour score" for the day. Scores are derived on the fly from the normal
// per-game results (scoreStore) + the connections session, so nothing extra
// needs to be recorded while playing — only the final total is snapshotted (see
// tour-scores store below) so a later day can compare against it.

export type TourGame =
  | 'screenshot'
  | 'trophy'
  | 'blur'
  | 'soundtrack'
  | 'connections'

// Fixed play order for the tour.
export const TOUR_GAMES: TourGame[] = [
  'screenshot',
  'trophy',
  'blur',
  'soundtrack',
  'connections',
]

export const TOUR_PATHS: Record<TourGame, string> = {
  screenshot: '/screenshot',
  trophy: '/trophy',
  blur: '/blur',
  soundtrack: '/soundtrack',
  connections: '/connections',
}

// Max points a single game can contribute (a first-guess solve).
export const MAX_PER_GAME = 1000

type Meta = { label: string; totalGuesses: number }

// totalGuesses drives the score curve. Blur only has 5 steps (vs 6) — dividing
// by its own total keeps a last-guess blur solve worth the same fraction of max
// as a last-guess 6-step solve, so the shorter game isn't unfairly cheap.
const META: Record<TourGame, Meta> = {
  screenshot: { label: 'Screenshot', totalGuesses: 6 },
  trophy: { label: 'Trophy', totalGuesses: 6 },
  blur: { label: 'Blur Reveal', totalGuesses: 5 },
  soundtrack: { label: 'Soundtrack', totalGuesses: 6 },
  connections: { label: 'Connections', totalGuesses: 0 },
}

export function tourLabel(game: TourGame): string {
  return META[game].label
}

export type TourGameStatus = 'solved' | 'lost' | 'unplayed'

export type TourGameScore = {
  gameType: TourGame
  label: string
  score: number
  status: TourGameStatus
  detail: string
}

export type TourBreakdown = {
  perGame: TourGameScore[]
  total: number
}

// ── Per-game scoring ─────────────────────────────────────────────────────────

function scoreSingleAnswer(
  result: PuzzleResult | undefined,
  totalGuesses: number,
): Omit<TourGameScore, 'gameType' | 'label'> {
  if (!result) return { score: 0, status: 'unplayed', detail: 'Not played' }
  if (result.status !== 'solved') {
    return { score: 0, status: 'lost', detail: 'Missed it' }
  }
  const used = result.guesses.length // the correct guess is the last one
  const wrongBefore = Math.max(0, used - 1)
  const score = Math.round(
    (MAX_PER_GAME * (totalGuesses - wrongBefore)) / totalGuesses,
  )
  return {
    score: Math.max(0, score),
    status: 'solved',
    detail: `Solved in ${used}`,
  }
}

// The connections page keeps its own date-keyed session; read it directly so we
// can score partial (lost) runs by how many groups were found.
const CONN_PREFIX = 'dailies/connections-session/v1/'

type ConnSession = {
  solved: number[]
  mistakes: number
  unlimited: boolean
  status: 'playing' | 'won' | 'lost'
}

function readConnSession(date: string): ConnSession | null {
  try {
    const raw = localStorage.getItem(CONN_PREFIX + date)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.solved)) return null
    return parsed as ConnSession
  } catch {
    return null
  }
}

export function connectionsStarted(date: string): boolean {
  return readConnSession(date) !== null || !!getResult(date, 'connections')
}

function scoreConnections(
  date: string,
): Omit<TourGameScore, 'gameType' | 'label'> {
  const session = readConnSession(date)
  const result = getResult(date, 'connections')
  if (!session && !result) {
    return { score: 0, status: 'unplayed', detail: 'Not played' }
  }
  const groups = session
    ? session.solved.length
    : result?.status === 'solved'
      ? CONNECTIONS_GROUP_COUNT
      : 0
  const mistakes = session
    ? session.mistakes
    : (result?.guessCount ?? CONNECTIONS_MAX_MISTAKES)
  const unlimited = session?.unlimited ?? false
  const finished = !!result || (session != null && session.status !== 'playing')

  // Fraction of groups found, scaled by how clean the run was. Unlimited runs
  // still take a mistake hit so a flawless capped win stays the top score.
  const cappedMistakes = Math.min(mistakes, CONNECTIONS_MAX_MISTAKES)
  const mistakeFactor =
    (CONNECTIONS_MAX_MISTAKES + 1 - cappedMistakes) /
    (CONNECTIONS_MAX_MISTAKES + 1)
  const score = Math.round(
    (MAX_PER_GAME * (groups / CONNECTIONS_GROUP_COUNT)) * mistakeFactor,
  )

  const won = groups >= CONNECTIONS_GROUP_COUNT
  const status: TourGameStatus = finished
    ? won
      ? 'solved'
      : 'lost'
    : 'unplayed'
  const detail = unlimited
    ? `${groups}/${CONNECTIONS_GROUP_COUNT} groups · unlimited`
    : `${groups}/${CONNECTIONS_GROUP_COUNT} groups · ${mistakes} mistake${mistakes === 1 ? '' : 's'}`

  return { score: Math.max(0, score), status, detail }
}

export function scoreTourGame(date: string, game: TourGame): TourGameScore {
  const base =
    game === 'connections'
      ? scoreConnections(date)
      : scoreSingleAnswer(
          getResult(date, game as GameType),
          META[game].totalGuesses,
        )
  return { gameType: game, label: META[game].label, ...base }
}

export function computeTourBreakdown(date: string): TourBreakdown {
  const perGame = TOUR_GAMES.map((g) => scoreTourGame(date, g))
  const total = perGame.reduce((sum, g) => sum + g.score, 0)
  return { perGame, total }
}

// The whole tour is "finished" once the last game (connections) resolves.
export function isTourComplete(date: string): boolean {
  return !!getResult(date, 'connections')
}

// ── Snapshot store (for cross-day comparison) ────────────────────────────────

const SNAP_KEY = 'dailies/tour-scores/v1'

export type TourSnapshot = {
  date: string
  total: number
  perGame: { gameType: TourGame; score: number }[]
}

type SnapMap = Record<string, TourSnapshot>

function loadSnaps(): SnapMap {
  try {
    const raw = localStorage.getItem(SNAP_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SnapMap
  } catch {
    return {}
  }
}

export function getTourSnapshot(date: string): TourSnapshot | undefined {
  return loadSnaps()[date]
}

export function saveTourSnapshot(date: string): TourSnapshot {
  const breakdown = computeTourBreakdown(date)
  const snap: TourSnapshot = {
    date,
    total: breakdown.total,
    perGame: breakdown.perGame.map((g) => ({
      gameType: g.gameType,
      score: g.score,
    })),
  }
  try {
    const map = loadSnaps()
    map[date] = snap
    localStorage.setItem(SNAP_KEY, JSON.stringify(map))
  } catch {
    /* ignore storage errors */
  }
  return snap
}
