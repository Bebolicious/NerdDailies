// Scoring for the Higher/Lower 'slider' and 'piggyback' pair types.
//
// Pure functions — no React, no storage — so both the reducer (which mutates
// the persisted score) and the render (which shows the per-player breakdown)
// can call them and never drift.
//
// The base curve is deliberately category-agnostic: every SliderConfig carries
// a `bullseye` window and a `spread` (the raw-unit distance at which an
// off-guess decays to zero), so a Metacritic point, a release year, and an
// HLTB hour all land on the same 0–150 scale.

import type { SliderConfig } from './types'

export const SLIDER_BASE_POINTS = 100 // a bullseye — mirrors +100 per correct vs pick
export const BANG_ON_BONUS = 50 // extra for landing exactly ("Bang on!")
export const BLUFF_BONUS_PER_FOLLOWER = 50 // piggyback: reward per fooled follower

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

// The bluff threshold: a lead-off guess this far (or further) from the truth is
// a "big bluff" and becomes eligible for follower bonuses.
export function bluffThreshold(slider: SliderConfig): number {
  return 0.5 * slider.spread
}

// How close a follower must land to the bar to count as "trusting" the bluff.
export function bluffTrustWindow(slider: SliderConfig): number {
  return Math.max(1, Math.round(0.2 * slider.spread))
}

export type PiggybackPlayerResult = {
  value: number
  base: number // slider score before the shared-value split
  split: number // how many players share this exact value (≥1)
  points: number // final: round(base / split) + any bluff bonus
  tag: SliderTag
  diff: number
  isBar: boolean // lead-off player who set the bar
  fooled?: number // (bar only) followers who trusted the bluff
  bluffBonus?: number // (bar only) points earned from the bluff
}

// Score a whole piggyback round.
//   order  — the round's pick order; order[0] is the bar-setter.
//   values — playerId → their locked guess.
//
// 1. Each guess is scored on the base slider curve.
// 2. Any value shared by K players splits its base by K (copying is punished —
//    the bar-setter included).
// 3. If the bar-setter big-bluffed (≥ bluffThreshold off the truth), they earn
//    BLUFF_BONUS_PER_FOLLOWER for every follower who landed within the trust
//    window of the bar AND is themselves way off (≥ threshold from the truth).
export function scorePiggyback(
  slider: SliderConfig,
  actual: number,
  order: string[],
  values: Record<string, number>,
): Record<string, PiggybackPlayerResult> {
  const shareCount: Record<number, number> = {}
  for (const id of order) {
    const v = values[id]
    if (v !== undefined) shareCount[v] = (shareCount[v] ?? 0) + 1
  }

  const barId = order[0]
  const barVal = values[barId]
  const bluffing =
    barVal !== undefined && Math.abs(barVal - actual) >= bluffThreshold(slider)
  const window = bluffTrustWindow(slider)
  const threshold = bluffThreshold(slider)

  let fooled = 0
  if (bluffing) {
    for (let i = 1; i < order.length; i++) {
      const v = values[order[i]]
      if (v === undefined) continue
      if (Math.abs(v - barVal) <= window && Math.abs(v - actual) >= threshold) {
        fooled++
      }
    }
  }

  const out: Record<string, PiggybackPlayerResult> = {}
  for (const id of order) {
    const v = values[id]
    if (v === undefined) continue
    const s = scoreSliderGuess(slider, actual, v)
    const split = shareCount[v]
    let points = Math.round(s.points / split)
    const isBar = id === barId
    let bluffBonus = 0
    if (isBar && bluffing && fooled > 0) {
      bluffBonus = fooled * BLUFF_BONUS_PER_FOLLOWER
      points += bluffBonus
    }
    out[id] = {
      value: v,
      base: s.points,
      split,
      points,
      tag: s.tag,
      diff: s.diff,
      isBar,
      fooled: isBar ? fooled : undefined,
      bluffBonus: bluffBonus || undefined,
    }
  }
  return out
}

// Human label for a tag — reused by the reveal cards and the HUD.
export function tagLabel(tag: SliderTag): string {
  return tag === 'bang' ? 'Bang on!' : tag === 'bullseye' ? 'Bullseye!' : 'Off'
}
