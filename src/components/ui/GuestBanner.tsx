import { useState, type CSSProperties } from 'react'
import { cn } from '../../lib/cn'
import {
  bannerBackground,
  parseColors,
  readableTextOn,
  textFillStyle,
} from '../../lib/decor'
import type { BannerStyle, GameType } from '../../lib/types'

// Diagonal banner pinned to a puzzle card. Two content modes and two variants:
//
// Modes:
//   • submitter → two-line "SUBMITTED BY / name", colored by the game's tone.
//   • custom    → a single arbitrary line (e.g. "VALENTINE'S DAY") in a custom
//                 color. Set via `text` (+ optional `color`); OVERRIDES the
//                 submitter credit when both are present.
//
// Variants:
//   • corner  → diagonal banner clipped over a positioned parent's top-right
//               (screenshot, blur cover, trophy card, soundtrack, archive).
//   • inline  → smaller free-hanging diagonal next to a heading (Mini Crossword
//               + the admin editor preview).

type Tone =
  | 'coral'
  | 'blue'
  | 'lime'
  | 'mustard'
  | 'pink'
  | 'violet'
  | 'teal'
  | 'orange'

const TONE_BG: Record<Tone, string> = {
  coral: 'bg-coral text-ink-static',
  blue: 'bg-blue text-paper-static',
  lime: 'bg-lime text-ink-static',
  mustard: 'bg-mustard text-ink-static',
  pink: 'bg-pink text-ink-static',
  violet: 'bg-violet text-paper-static',
  teal: 'bg-teal text-ink-static',
  orange: 'bg-orange text-ink-static',
}

const GAME_TONE: Record<GameType, Tone> = {
  screenshot: 'coral',
  trophy: 'blue',
  blur: 'lime',
  soundtrack: 'mustard',
  crossword: 'pink',
  archive: 'violet',
  higherlower: 'teal',
  connections: 'orange',
}

type Props = {
  gameType: GameType
  submitter?: string
  /** Custom banner label — when set, overrides the submitter credit. */
  text?: string
  /** Custom banner background — hex, or a comma list for stripes/gradient. */
  color?: string
  /** Overrides the auto-contrast text color — hex, or a comma list (gradient). */
  textColor?: string
  /** How a multi-color background renders. Default 'stripes'. */
  style?: BannerStyle
  variant?: 'corner' | 'inline'
  className?: string
}

// A dark outline so auto-colored text stays legible across every band of a
// multi-color background (e.g. white text over a white flag stripe).
const OUTLINE_SHADOW =
  '-1px 0 #1b1b3a, 1px 0 #1b1b3a, 0 -1px #1b1b3a, 0 1px #1b1b3a'

export function GuestBanner({
  gameType,
  submitter,
  text,
  color,
  textColor,
  style: bannerStyle = 'stripes',
  variant = 'corner',
  className,
}: Props) {
  // Drop the animation class once the entrance finishes. Otherwise the animated
  // `scale` keeps the element promoted to a compositor layer, leaving the
  // rotated text rasterized slightly fuzzy. With the class gone the layer goes
  // away and the browser re-rasterizes the glyphs crisply.
  const [animating, setAnimating] = useState(true)
  const handleEnd = () => setAnimating(false)

  const custom = !!text?.trim()
  const bgColors = parseColors(color)
  // Custom background only applies with a label; otherwise use the game tone.
  const useCustomBg = custom && bgColors.length > 0
  const background = useCustomBg
    ? bannerBackground(bgColors, bannerStyle)
    : undefined
  const toneClass = useCustomBg ? '' : TONE_BG[GAME_TONE[gameType]]

  const textColors = parseColors(textColor)
  const multiBg = useCustomBg && bgColors.length >= 2
  // No explicit text color over a multi-band background → white + dark outline
  // so it reads on every stripe. Single custom bg → auto light/dark contrast.
  const autoOutline = multiBg && textColors.length === 0

  const containerColor =
    textColors.length === 1
      ? textColors[0]
      : autoOutline
        ? '#ffffff'
        : useCustomBg
          ? readableTextOn(bgColors[0])
          : undefined

  const containerStyle: CSSProperties | undefined =
    background || containerColor || autoOutline
      ? {
          ...(background ? { background } : {}),
          ...(containerColor ? { color: containerColor } : {}),
          ...(autoOutline ? { textShadow: OUTLINE_SHADOW } : {}),
        }
      : undefined

  // Gradient text is clipped on the inner text node so it doesn't collide with
  // the bar's own background.
  const gradientText = textColors.length >= 2 ? textFillStyle(textColors) : undefined
  const label = custom ? text!.trim() : `Submitted by ${submitter ?? ''}`

  if (variant === 'inline') {
    return (
      <div
        onAnimationEnd={handleEnd}
        style={containerStyle}
        className={cn(
          'rotate-[-6deg] border-y-2 border-stroke font-display uppercase font-bold px-5 py-1.5 shadow-neo whitespace-nowrap leading-tight text-center',
          animating && 'animate-guest-banner-inline',
          toneClass,
          className,
        )}
        aria-label={label}
      >
        {custom ? (
          <div className="text-[14px] tracking-[0.12em]" style={gradientText}>
            {text!.trim()}
          </div>
        ) : (
          <>
            <div className="text-[11px] tracking-[0.18em] opacity-80">
              Submitted by
            </div>
            <div className="text-[14px] tracking-[0.12em]" style={gradientText}>
              {submitter}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      onAnimationEnd={handleEnd}
      style={containerStyle}
      className={cn(
        'absolute top-8 -right-16 w-64 text-center rotate-45 border-y-[3px] border-stroke font-display uppercase font-bold py-2 shadow-neo pointer-events-none z-30 overflow-hidden whitespace-nowrap leading-tight',
        animating && 'animate-guest-banner-corner',
        toneClass,
        className,
      )}
      aria-label={label}
    >
      {custom ? (
        <div className="text-[15px] tracking-[0.1em] px-2 truncate" style={gradientText}>
          {text!.trim()}
        </div>
      ) : (
        <>
          <div className="text-[12px] tracking-[0.15em] opacity-80 px-2">
            Submitted by
          </div>
          <div className="text-[15px] tracking-[0.1em] px-2 truncate" style={gradientText}>
            {submitter}
          </div>
        </>
      )}
    </div>
  )
}
