import { useState } from 'react'
import { cn } from '../../lib/cn'
import { readableTextOn } from '../../lib/decor'
import type { GameType } from '../../lib/types'

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
  /** Custom banner background hex (only used with `text`). */
  color?: string
  variant?: 'corner' | 'inline'
  className?: string
}

export function GuestBanner({
  gameType,
  submitter,
  text,
  color,
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
  // Custom color only overrides when both a label and a color are given;
  // otherwise fall back to the game tone class.
  const useCustomColor = custom && !!color?.trim()
  const toneClass = custom && useCustomColor ? '' : TONE_BG[GAME_TONE[gameType]]
  const style = useCustomColor
    ? { background: color, color: readableTextOn(color) }
    : undefined
  const label = custom ? text!.trim() : `Submitted by ${submitter ?? ''}`

  if (variant === 'inline') {
    return (
      <div
        onAnimationEnd={handleEnd}
        style={style}
        className={cn(
          'rotate-[-6deg] border-y-2 border-stroke font-display uppercase font-bold px-5 py-1.5 shadow-neo whitespace-nowrap leading-tight text-center',
          animating && 'animate-guest-banner-inline',
          toneClass,
          className,
        )}
        aria-label={label}
      >
        {custom ? (
          <div className="text-[14px] tracking-[0.12em]">{text!.trim()}</div>
        ) : (
          <>
            <div className="text-[11px] tracking-[0.18em] opacity-80">
              Submitted by
            </div>
            <div className="text-[14px] tracking-[0.12em]">{submitter}</div>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      onAnimationEnd={handleEnd}
      style={style}
      className={cn(
        'absolute top-8 -right-16 w-64 text-center rotate-45 border-y-[3px] border-stroke font-display uppercase font-bold py-2 shadow-neo pointer-events-none z-30 overflow-hidden whitespace-nowrap leading-tight',
        animating && 'animate-guest-banner-corner',
        toneClass,
        className,
      )}
      aria-label={label}
    >
      {custom ? (
        <div className="text-[15px] tracking-[0.1em] px-2 truncate">
          {text!.trim()}
        </div>
      ) : (
        <>
          <div className="text-[12px] tracking-[0.15em] opacity-80 px-2">
            Submitted by
          </div>
          <div className="text-[15px] tracking-[0.1em] px-2 truncate">
            {submitter}
          </div>
        </>
      )}
    </div>
  )
}
