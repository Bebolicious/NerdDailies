import type { CSSProperties } from 'react'
import type { BannerStyle, PuzzleDecor, ScreenEffectType } from './types'

// Shared helpers for the per-puzzle "decor" (custom banner + page-wide screen
// effect). Keeps the DB row <-> PuzzleDecor mapping in one place so the eight
// fetchers and eight editors stay identical. See `types.ts → PuzzleDecor` and
// `components/ui/ScreenEffects.tsx`.

// The decor columns every puzzle fetch appends to its `.select(...)`. Inlined
// as a string LITERAL at each call site (Supabase infers the row type from the
// literal, so it can't be concatenated in) — kept here as the canonical list:
//   submitter,banner_text,banner_color,banner_text_color,banner_style,
//   effect_type,effect_emoji,effect_color

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
  banner_text_color?: string | null
  banner_style?: string | null
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
    bannerTextColor: row.banner_text_color ?? undefined,
    bannerStyle: (row.banner_style as BannerStyle | null) ?? undefined,
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
  // Only persist a banner style once the background is actually multi-color —
  // it has no meaning for a solid banner, and defaulting to null keeps 'stripes'
  // as the implicit render fallback.
  const multiBanner = parseColors(decor.bannerColor).length >= 2
  return {
    submitter: clean(decor.submitter),
    banner_text: clean(decor.bannerText),
    banner_color: clean(decor.bannerColor),
    banner_text_color: clean(decor.bannerTextColor),
    banner_style: multiBanner ? decor.bannerStyle ?? 'stripes' : null,
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

// ── Multi-color specs ───────────────────────────────────────────────────────
// bannerColor / bannerTextColor / effectColor are all stored as a comma-
// separated list of hex values. One color = solid; 2+ = a gradient.

// Split a stored spec into valid, normalized (`#`-prefixed) hex colors.
export function parseColors(spec?: string): string[] {
  if (!spec) return []
  return spec
    .split(',')
    .map((raw) => {
      if (!parseHex(raw)) return null
      const t = raw.trim()
      return t.startsWith('#') ? t : `#${t}`
    })
    .filter((c): c is string => c !== null)
}

// CSS `background` for the banner bar. `stripes` = hard-edged even bands (flags
// like Bastille Day); `gradient` = smooth blend. One color returns that color.
export function bannerBackground(
  colors: string[],
  style: BannerStyle,
): string | undefined {
  if (colors.length === 0) return undefined
  if (colors.length === 1) return colors[0]
  if (style === 'gradient') {
    return `linear-gradient(90deg, ${colors.join(', ')})`
  }
  const n = colors.length
  const stops = colors.map((c, i) => {
    const from = ((i / n) * 100).toFixed(2)
    const to = (((i + 1) / n) * 100).toFixed(2)
    return `${c} ${from}% ${to}%`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

// Inline style for banner text: a solid color for one value, or a clipped
// linear-gradient fill for several. Empty list → `{}` (caller keeps its
// auto-contrast color). Applied to the inner text node, never the banner bar
// (background-clip:text would fight the bar's own background).
export function textFillStyle(colors: string[]): CSSProperties {
  if (colors.length === 0) return {}
  if (colors.length === 1) return { color: colors[0] }
  return {
    backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  }
}

// CSS `background` for the finish-screen vignette: transparent center fading out
// to the color(s) at the edge. Multiple colors spread across the outer ring.
export function vignetteBackground(colors: string[]): string | undefined {
  if (colors.length === 0) return undefined
  if (colors.length === 1) {
    return `radial-gradient(ellipse at center, transparent 42%, ${colors[0]} 100%)`
  }
  const n = colors.length
  const stops = colors.map((c, i) => {
    const pct = (42 + ((i + 1) / n) * 58).toFixed(1)
    return `${c} ${pct}%`
  })
  return `radial-gradient(ellipse at center, transparent 42%, ${stops.join(', ')})`
}

// Ready-made multi-color banners for the admin presets dropdown. `colors` is a
// comma-separated spec that drops straight into `bannerColor`.
export const BANNER_PRESETS: {
  id: string
  label: string
  colors: string
  style: BannerStyle
}[] = [
  { id: 'fr', label: '🇫🇷 France / Bastille Day', colors: '#0055A4,#ffffff,#EF4135', style: 'stripes' },
  { id: 'it', label: '🇮🇹 Italy', colors: '#008C45,#ffffff,#CD212A', style: 'stripes' },
  { id: 'de', label: '🇩🇪 Germany', colors: '#000000,#DD0000,#FFCE00', style: 'stripes' },
  { id: 'ie', label: '🇮🇪 Ireland', colors: '#169B62,#ffffff,#FF883E', style: 'stripes' },
  { id: 'pride', label: '🏳️‍🌈 Pride', colors: '#e40303,#ff8c00,#ffed00,#008026,#004dff,#750787', style: 'stripes' },
  { id: 'trans', label: '🏳️‍⚧️ Trans', colors: '#5BCEFA,#F5A9B8,#ffffff,#F5A9B8,#5BCEFA', style: 'stripes' },
  { id: 'sunset', label: '🌅 Sunset (smooth)', colors: '#ff5d5d,#ff8a3d,#f4b73e', style: 'gradient' },
  { id: 'ocean', label: '🌊 Ocean (smooth)', colors: '#5167e8,#00b4d8,#b5e548', style: 'gradient' },
]
