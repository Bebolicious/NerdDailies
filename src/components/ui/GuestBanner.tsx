import { useState } from 'react'
import { cn } from '../../lib/cn'
import type { GameType } from '../../lib/types'

// One unified "GUEST · NAME" banner for community-submitted puzzles. Two
// variants:
//
//   • corner  → diagonal banner pinned to the top-right of a positioned parent.
//               Used for image/audio cards where the banner clips over the
//               container's corner (screenshot, blur cover, trophy card,
//               soundtrack player, archive room).
//   • inline  → smaller free-hanging diagonal sitting next to a heading.
//               Used by Mini Crossword so it doesn't overlap the puzzle grid.
//
// The background color is tied to the game's sidebar tone so each game has a
// distinct, consistent "credit color".

type Tone = 'coral' | 'blue' | 'lime' | 'mustard' | 'pink' | 'violet'

const TONE_BG: Record<Tone, string> = {
  coral: 'bg-coral text-ink-static',
  blue: 'bg-blue text-paper-static',
  lime: 'bg-lime text-ink-static',
  mustard: 'bg-mustard text-ink-static',
  pink: 'bg-pink text-ink-static',
  violet: 'bg-violet text-paper-static',
}

const GAME_TONE: Record<GameType, Tone> = {
  screenshot: 'coral',
  trophy: 'blue',
  blur: 'lime',
  soundtrack: 'mustard',
  crossword: 'pink',
  archive: 'violet',
}

type Props = {
  name: string
  gameType: GameType
  variant?: 'corner' | 'inline'
  className?: string
}

export function GuestBanner({
  name,
  gameType,
  variant = 'corner',
  className,
}: Props) {
  const tone = TONE_BG[GAME_TONE[gameType]]
  const label = `Submitted by ${name}`

  // Drop the animation class once the entrance finishes. Otherwise the
  // animated `scale` keeps the element promoted to a compositor layer, which
  // leaves the rotated text rasterized at a slightly-fuzzy resolution. With
  // the class gone, the layer goes away and the browser re-rasterizes the
  // glyphs crisply.
  const [animating, setAnimating] = useState(true)
  const handleEnd = () => setAnimating(false)

  if (variant === 'inline') {
    return (
      <div
        onAnimationEnd={handleEnd}
        className={cn(
          'rotate-[-6deg] border-y-2 border-stroke font-display uppercase font-bold px-5 py-1.5 shadow-neo whitespace-nowrap leading-tight text-center',
          animating && 'animate-guest-banner-inline',
          tone,
          className,
        )}
        aria-label={label}
      >
        <div className="text-[11px] tracking-[0.18em] opacity-80">
          Submitted by
        </div>
        <div className="text-[14px] tracking-[0.12em]">{name}</div>
      </div>
    )
  }

  return (
    <div
      onAnimationEnd={handleEnd}
      className={cn(
        'absolute top-8 -right-16 w-64 text-center rotate-45 border-y-[3px] border-stroke font-display uppercase font-bold py-2 shadow-neo pointer-events-none z-30 overflow-hidden whitespace-nowrap leading-tight',
        animating && 'animate-guest-banner-corner',
        tone,
        className,
      )}
      aria-label={label}
    >
      <div className="text-[12px] tracking-[0.15em] opacity-80 px-2">
        Submitted by
      </div>
      <div className="text-[15px] tracking-[0.1em] px-2 truncate">{name}</div>
    </div>
  )
}
