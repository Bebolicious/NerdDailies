import { matchesLink } from './archivePresets'
import {
  ARCHIVE_FRAME_BLUR_PX,
  ARCHIVE_MAX_WRONG,
  type ArchiveClue,
  type ArchiveHidingSpot,
  type ArchivePuzzle,
  type Game,
} from './types'

// The Archive's rules, as pure functions over a session. Kept out of the page
// component so the week's mechanics — what a candle buys, what a wrong guess
// costs, when the case closes — can be reasoned about (and exercised) without
// rendering a room.
//
// Nothing here touches the score store: the reducers only move `status` to
// 'solved' / 'lost', and the page reports the finished result in an effect.

export type ArchiveWrong = {
  label: string
  target: 'game' | 'link'
  at: number
}

export type ArchiveSession = {
  // v1 was the single-answer, fixed-room game. Its shape can't be migrated
  // (clue ids didn't exist), so a v1 session simply starts over.
  version: 2
  candles: number
  opened: Record<string, boolean>
  locked: Record<string, boolean>
  foundSpots: Partial<Record<ArchiveHidingSpot, boolean>>
  solvedA: Game | null
  solvedB: Game | null
  linkSolved: boolean
  wrongs: ArchiveWrong[]
  status: 'playing' | 'solved' | 'lost'
  // Post-game only: the player asked to see the rest of the room. Optional so
  // sessions written before this existed still load as v2.
  revealedAll?: boolean
  spareCandleClaimed: boolean
  jackpotUntil: number | null
  jackpotSrc: string | null
  startedAt: number
  finishedAt: number | null
  stampToast: number | null
}

export function emptySession(now: number, candles: number): ArchiveSession {
  return {
    version: 2,
    candles,
    opened: {},
    locked: {},
    foundSpots: {},
    solvedA: null,
    solvedB: null,
    linkSolved: false,
    wrongs: [],
    status: 'playing',
    revealedAll: false,
    spareCandleClaimed: false,
    jackpotUntil: null,
    jackpotSrc: null,
    startedAt: now,
    finishedAt: null,
    stampToast: null,
  }
}

const SESSION_PREFIX = 'dailies/archive-session/v1/'

export function loadSession(week: string): ArchiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + week)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ArchiveSession
    if (parsed.version !== 2) return null
    return parsed
  } catch {
    return null
  }
}

export function persistSession(week: string, state: ArchiveSession) {
  try {
    localStorage.setItem(SESSION_PREFIX + week, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

// Deterministic 0..1 hash from a string, so which clue a wrong guess locks is
// stable for a given week rather than re-rolling on every render.
function seedHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

// ── derived ─────────────────────────────────────────────────────────────────

// A jackpot box is too strong to crack open early: it shimmers from the moment
// it's found but stays sealed until the player is down to their last guess —
// then it opens FREE, so it's a guaranteed lifeline rather than something they
// can no longer afford after exploring the room.
export function jackpotSealed(s: ArchiveSession): boolean {
  return s.wrongs.length < ARCHIVE_MAX_WRONG - 1
}

export function clueCost(clue: ArchiveClue): number {
  return clue.outcome === 'jackpot' ? 0 : clue.cost
}

export function blurPx(s: ArchiveSession): number {
  if (s.status !== 'playing') return 0
  return ARCHIVE_FRAME_BLUR_PX[
    Math.min(s.wrongs.length, ARCHIVE_FRAME_BLUR_PX.length - 1)
  ]
}

export function isFound(s: ArchiveSession, clue: ArchiveClue): boolean {
  return !clue.hiddenSpot || !!s.foundSpots[clue.hiddenSpot]
}

// ── reducers ────────────────────────────────────────────────────────────────

export function openClue(s: ArchiveSession, clue: ArchiveClue): ArchiveSession {
  if (s.status !== 'playing') return s
  if (s.opened[clue.id] || s.locked[clue.id]) return s
  if (!isFound(s, clue)) return s
  const isJackpot = clue.outcome === 'jackpot'
  if (isJackpot && jackpotSealed(s)) return s
  const cost = clueCost(clue)
  if (s.candles < cost) return s
  const showsArt = isJackpot && clue.body.kind === 'image'
  return {
    ...s,
    candles: s.candles - cost,
    opened: { ...s.opened, [clue.id]: true },
    jackpotUntil: showsArt ? Date.now() + 3000 : s.jackpotUntil,
    jackpotSrc: showsArt && clue.body.kind === 'image' ? clue.body.src : s.jackpotSrc,
  }
}

// Searching is always free — it only reveals what's stashed there. Opening
// what you found is still a separate, paid step.
export function searchSpot(
  s: ArchiveSession,
  spot: ArchiveHidingSpot,
): ArchiveSession {
  if (s.status !== 'playing' || s.foundSpots[spot]) return s
  return { ...s, foundSpots: { ...s.foundSpots, [spot]: true } }
}

// Once the case is closed — won or lost — the room has nothing left to protect,
// so the player can throw everything open and read/listen to what they never
// paid for. Deliberately one-way and post-game only: it spends no candles and
// records nothing, it's just the tour of what you missed. The session keeps
// counting `opened` separately, so the score, rank and share string are all
// still the run the player actually played.
export function revealAllClues(s: ArchiveSession): ArchiveSession {
  if (s.status === 'playing' || s.revealedAll) return s
  return { ...s, revealedAll: true }
}

export function claimSpareCandle(
  s: ArchiveSession,
  max: number,
): ArchiveSession {
  if (s.status !== 'playing' || s.spareCandleClaimed) return s
  return {
    ...s,
    spareCandleClaimed: true,
    candles: Math.min(max, s.candles + 1),
  }
}

// A wrong answer — of either kind — burns one stamp, locks one still-sealed
// clue (never the chest, never a jackpot: those are the paid guarantees), and
// sharpens the images that were authored to sharpen.
function registerWrong(
  s: ArchiveSession,
  puzzle: ArchivePuzzle,
  week: string,
  label: string,
  target: 'game' | 'link',
): ArchiveSession {
  const lockable = puzzle.clues.filter(
    (c) =>
      c.container !== 'chest' &&
      c.outcome !== 'jackpot' &&
      !s.opened[c.id] &&
      !s.locked[c.id],
  )
  const pick =
    lockable.length > 0
      ? lockable[
          Math.floor(seedHash(week + label + s.wrongs.length) * lockable.length)
        ]
      : null
  const wrongs = [...s.wrongs, { label, target, at: Date.now() }]
  const lost = wrongs.length >= ARCHIVE_MAX_WRONG
  return {
    ...s,
    wrongs,
    locked: pick ? { ...s.locked, [pick.id]: true } : s.locked,
    status: lost ? 'lost' : 'playing',
    finishedAt: lost ? Date.now() : s.finishedAt,
    stampToast: Date.now(),
  }
}

// One search box fills whichever game slot the guess matches, so the two
// subjects can be named in either order.
export function guessGame(
  s: ArchiveSession,
  g: Game,
  puzzle: ArchivePuzzle,
  week: string,
): ArchiveSession {
  if (s.status !== 'playing') return s
  const hitsA = !s.solvedA && g.id === puzzle.game_a.id
  const hitsB = !s.solvedB && g.id === puzzle.game_b.id
  if (!hitsA && !hitsB) return registerWrong(s, puzzle, week, g.name, 'game')
  return {
    ...s,
    solvedA: hitsA ? g : s.solvedA,
    solvedB: hitsB ? g : s.solvedB,
  }
}

// The third answer. Only reachable once both games are named — the page hides
// the input until then, and this guards it too.
export function guessLink(
  s: ArchiveSession,
  text: string,
  puzzle: ArchivePuzzle,
  week: string,
): ArchiveSession {
  if (s.status !== 'playing') return s
  if (!s.solvedA || !s.solvedB) return s
  if (!matchesLink(text, puzzle.link))
    return registerWrong(s, puzzle, week, text, 'link')
  return {
    ...s,
    linkSolved: true,
    status: 'solved',
    finishedAt: Date.now(),
    jackpotUntil: null,
    jackpotSrc: null,
  }
}

// ── end of game ─────────────────────────────────────────────────────────────

export function computeRank(
  candles: number,
  total: number,
  wrongs: number,
): { title: string; blurb: string } {
  // Score out of 1: mostly candles left, with the wrong-guess stamps as a
  // secondary penalty so a frugal-but-sloppy run doesn't outrank a clean one.
  const frugality = total > 0 ? candles / total : 0
  const precision = 1 - wrongs / ARCHIVE_MAX_WRONG
  const score = frugality * 0.65 + precision * 0.35
  if (score >= 0.85) return { title: 'Archivist', blurb: 'You barely lit a match.' }
  if (score >= 0.65) return { title: 'Detective', blurb: 'Calm and economical.' }
  if (score >= 0.45) return { title: 'Investigator', blurb: 'Solid work, agent.' }
  if (score >= 0.2) return { title: 'Intern', blurb: 'You’re learning.' }
  return { title: 'Ghost', blurb: 'You burned the whole drawer.' }
}

export function buildShareString(
  s: ArchiveSession,
  puzzle: ArchivePuzzle,
  weekLabel: number,
): string {
  const candles =
    '🕯️'.repeat(s.candles) + '·'.repeat(Math.max(0, puzzle.candles - s.candles))
  const wrongs =
    '✗'.repeat(s.wrongs.length) +
    '·'.repeat(Math.max(0, ARCHIVE_MAX_WRONG - s.wrongs.length))
  const mark = (ok: boolean) => (ok ? '🟩' : '⬛')
  const answers = `A${mark(!!s.solvedA)} B${mark(!!s.solvedB)} 🔗${mark(s.linkSolved)}`
  const opened = Object.values(s.opened).filter(Boolean).length
  const headline = s.status === 'solved' ? '★ Archived' : '✗ Cold case'
  return `The Archive · Week ${weekLabel}
${headline}
${answers}
${candles}  ${wrongs}
clues opened: ${opened}`
}
