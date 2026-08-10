// Scoring for the Higher/Lower 'slider' and 'auction' pair types.
//
// Pure functions — no React, no storage — so both the reducer (which mutates
// the persisted score) and the render (which shows the per-player breakdown)
// can call them and never drift.
//
// The slider base curve is deliberately category-agnostic: every SliderConfig
// carries a `bullseye` window and a `spread` (the raw-unit distance at which an
// off-guess decays to zero), so a Metacritic point, a release year, and an
// HLTB hour all land on the same 0–150 scale. The auction ladder tops out at
// the same 150 so the two round types are worth comparable points.

import type { HigherLowerSide, SliderConfig } from './types'

export const SLIDER_BASE_POINTS = 100 // a bullseye — mirrors +100 per correct vs pick
export const BANG_ON_BONUS = 50 // extra for landing exactly ("Bang on!")

export type SliderTag = 'bang' | 'bullseye' | 'off'

export type SliderScore = {
  points: number // 0..150
  tag: SliderTag
  diff: number // |guess - actual| in raw units
}

// Score a single guess against the true value.
//   diff 0                     → "Bang on!"  (100 + 50)
//   diff ≤ bullseye            → "Bullseye!" (100)
//   otherwise                  → 100 − round(diff / spread × 100), floored at 0
export function scoreSliderGuess(
  slider: SliderConfig,
  actual: number,
  guess: number,
): SliderScore {
  const diff = Math.abs(guess - actual)
  if (diff === 0) return { points: SLIDER_BASE_POINTS + BANG_ON_BONUS, tag: 'bang', diff }
  if (diff <= slider.bullseye) return { points: SLIDER_BASE_POINTS, tag: 'bullseye', diff }
  const off = Math.min(100, Math.round((diff / slider.spread) * 100))
  return { points: Math.max(0, SLIDER_BASE_POINTS - off), tag: 'off', diff }
}

// A bullseye-or-better counts as "correct" for the daily-streak mirror and the
// pair-by-pair share grid (which are boolean, not point-based).
export function isSliderCorrect(s: SliderScore): boolean {
  return s.tag !== 'off'
}

// Per-player result for a revealed slider round. One shape for the HUD, the
// reveal rows, and the reducer.
export type SliderPlayerResult = {
  value: number
  points: number
  tag: SliderTag
  diff: number
}

// Human label for a tag — reused by the reveal cards and the HUD.
export function tagLabel(tag: SliderTag): string {
  return tag === 'bang' ? 'Bang on!' : tag === 'bullseye' ? 'Bullseye!' : 'Off'
}

// ─── auction ────────────────────────────────────────────────────────────────
//
// A shelf of games; each player claims one. Points are decided by where the
// claimed game truly ranks in the WHOLE shelf — unpicked games included. So
// taking the 4th-best game scores 4th-place points even if nobody took the top
// three: the table can collectively whiff the round.

// Points by 0-indexed rank in the shelf. Past the end of the ladder ⇒ 0.
export const AUCTION_POINTS = [150, 100, 70, 50, 35, 25, 15, 10, 5, 0]

export function auctionPointsForRank(rank: number): number {
  return AUCTION_POINTS[rank] ?? 0
}

// Rank every game on the shelf, best first. Returns an array of shelf indices
// ordered best → worst, plus each index's 0-based rank. Ties share the better
// rank (standard competition ranking: 150 / 150 / 70, never 150 / 100 / 70),
// so two identically-rated games can't be a trap.
export function rankAuctionGames(
  games: HigherLowerSide[],
  lowerWins: boolean,
): { order: number[]; rankOf: number[] } {
  const order = games
    .map((_, i) => i)
    .sort((x, y) =>
      lowerWins ? games[x].value - games[y].value : games[y].value - games[x].value,
    )
  const rankOf = new Array<number>(games.length)
  let rank = 0
  for (let i = 0; i < order.length; i++) {
    // Only advance the rank when the value actually changes, so ties tie.
    if (i > 0 && games[order[i]].value !== games[order[i - 1]].value) rank = i
    rankOf[order[i]] = rank
  }
  return { order, rankOf }
}

export type AuctionPlayerResult = {
  gameIndex: number // which shelf slot they claimed
  rank: number // 0-based rank of that game within the whole shelf
  points: number
  value: number
}

// Score a whole auction round. `picks` maps playerId → the shelf index they
// claimed. Players who never picked (shelf ran dry) are simply absent from the
// result, which the callers treat as zero.
export function scoreAuction(
  games: HigherLowerSide[],
  lowerWins: boolean,
  picks: Record<string, number>,
): Record<string, AuctionPlayerResult> {
  const { rankOf } = rankAuctionGames(games, lowerWins)
  const out: Record<string, AuctionPlayerResult> = {}
  for (const [id, gameIndex] of Object.entries(picks)) {
    const game = games[gameIndex]
    if (!game) continue
    const rank = rankOf[gameIndex]
    out[id] = {
      gameIndex,
      rank,
      points: auctionPointsForRank(rank),
      value: game.value,
    }
  }
  return out
}

// "1st" / "2nd" / "3rd" / "4th" … for the reveal rows.
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}
