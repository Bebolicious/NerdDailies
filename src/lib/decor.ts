import type { PuzzleDecor, ScreenEffectType } from './types'

// Shared helpers for the per-puzzle "decor" (custom banner + page-wide screen
// effect). Keeps the DB row <-> PuzzleDecor mapping in one place so the eight
// fetchers and eight editors stay identical. See `types.ts → PuzzleDecor` and
// `components/ui/ScreenEffects.tsx`.

// The decor columns every puzzle fetch appends to its `.select(...)`. Inlined
// as a string LITERAL at each call site (Supabase infers the row type from the
// literal, so it can't be concatenated in) — kept here as the canonical list:
//   submitter,banner_text,banner_color,effect_type,effect_emoji,effect_color

// Effect options offered in the admin dropdown. `null` id = no particle effect
// (a vignette-only look still works if an effect color is set on 'vignette').
export const SCREEN_EFFECTS: {
  id: '' | ScreenEffectType
  label: string
  hint: string
}[] = [
  { id: '', label: 'None', hint: 'No page-wide effect on finish.' },
  { id: 'falling', label: 'Falling', hint: 'Emojis drift down the screen (e.g. hearts).' },
  { id: 'rising', label: 'Rising', hint: 'Emojis float upward (balloons, bubbles, ghosts).' },
  { id: 'confetti', label: 'Confetti burst', hint: 'One-shot burst from the bottom corners.' },
  { id: 'vignette', label: 'Vignette only', hint: 'Just the colored edge glow — no particles.' },
]

// A loosely-typed puzzle row (only the decor columns matter here).
type DecorRow = {
  submitter?: string | null
  banner_text?: string | null
  banner_color?: string | null
  effect_type?: string | null
  effect_emoji?: string | null
  effect_color?: string | null
}

export function rowToDecor(row: DecorRow | null | undefined): PuzzleDecor {
  if (!row) return {}
  return {
    submitter: row.submitter ?? undefined,
    bannerText: row.banner_text ?? undefined,
    bannerColor: row.banner_color ?? undefined,
    effectType: (row.effect_type as ScreenEffectType | null) ?? undefined,
    effectEmoji: row.effect_emoji ?? undefined,
    effectColor: row.effect_color ?? undefined,
  }
}

// Serialize decor state back to DB columns. Blank strings become `null` so the
// columns clear cleanly (mirrors the old `submitter.trim() || null`).
export function decorToRow(decor: PuzzleDecor) {
  const clean = (v?: string) => {
    const t = (v ?? '').trim()
    return t.length ? t : null
  }
  // With no effect type (None), drop any lingering emoji/color so re-saving
  // actually clears the effect (the editor hides those fields when None).
  const hasEffect = !!decor.effectType
  return {
    submitter: clean(decor.submitter),
    banner_text: clean(decor.bannerText),
    banner_color: clean(decor.bannerColor),
    effect_type: decor.effectType ?? null,
    effect_emoji: hasEffect ? clean(decor.effectEmoji) : null,
    effect_color: hasEffect ? clean(decor.effectColor) : null,
  }
}

// Pick a legible text color (near-black or near-white) for a given background
// hex, so a custom banner stays readable on any color. Uses the standard sRGB
// relative-luminance threshold. Unparseable input falls back to dark ink.
export function readableTextOn(hex?: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return '#1b1b3a'
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.5 ? '#1b1b3a' : '#fdf5e0'
}

function parseHex(hex?: string): [number, number, number] | null {
  if (!hex) return null
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}
