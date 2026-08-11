import { useEffect } from 'react'
import { EyeOff, X } from 'lucide-react'
import { NeoButton } from '../ui/NeoButton'
import { TagPill } from '../ui/TagPill'

type Props = {
  /** How the front round ended — changes the pitch, not the offer. */
  frontStatus: 'solved' | 'lost'
  onAccept: () => void
  onDecline: () => void
}

// Offered once per drop, right after the front Blur round resolves, on the days
// the admin switched Back Cover on. Declining costs nothing — the sidebar's
// hard-mode tile stays available all day.
export function BlurBackAskModal({
  frontStatus,
  onAccept,
  onDecline,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDecline()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDecline])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-emphasis/60 backdrop-blur-sm px-4"
      onClick={onDecline}
      role="dialog"
      aria-modal="true"
      aria-label="Play Blur Reveal Back Cover"
    >
      {/* overflow-hidden is what clips the ribbon into a corner wedge — the
          ribbon itself deliberately overhangs the box on both ends. */}
      <div
        className="animate-tour-pop border-neo shadow-neo-lg bg-paper text-ink w-full max-w-md relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Diagonal "New!" ribbon — GuestBanner's corner geometry mirrored to
            the top-left (top-8 / -left-16 / w-64 / -rotate-45). */}
        <div
          aria-hidden
          className="absolute top-8 -left-16 w-64 text-center -rotate-45 border-y-[3px] border-stroke bg-lime text-ink-static font-display text-[15px] uppercase font-bold tracking-[0.1em] py-2 shadow-neo pointer-events-none z-20 whitespace-nowrap leading-tight"
        >
          New!
        </div>

        <button
          onClick={onDecline}
          aria-label="Close"
          className="absolute top-3 right-3 border-neo-2 p-1.5 bg-paper hover:bg-coral hover:text-ink-static transition-colors z-10"
        >
          <X className="h-3.5 w-3.5 stroke-[3]" />
        </button>

        <div className="px-6 pt-7 pb-5 text-center">
          <div className="mx-auto mb-4 inline-flex border-neo bg-emphasis text-paper-static p-3 shadow-neo">
            <EyeOff className="h-8 w-8 stroke-[2.5]" />
          </div>

          <div className="flex items-center justify-center gap-2 mb-2">
            <TagPill tone="ink">Hard mode</TagPill>
          </div>

          <h2 className="font-display text-2xl uppercase tracking-wider font-bold leading-none">
            Back Cover
          </h2>
          <p className="text-sm text-ink-soft mt-3 leading-relaxed">
            {frontStatus === 'solved'
              ? 'Nice one. Fancy a harder round?'
              : 'Rough one. Want a shot at redemption?'}{' '}
            Same rules, five guesses — but this time you're staring at the{' '}
            <strong className="text-ink">back</strong> of the box, and it's a
            different game.
          </p>
        </div>

        <div className="px-6 pb-6 flex items-center justify-center gap-3">
          <NeoButton tone="ink" size="md" onClick={onAccept}>
            Play Back Cover
          </NeoButton>
          <NeoButton tone="paper" size="md" onClick={onDecline}>
            Not today
          </NeoButton>
        </div>
      </div>
    </div>
  )
}
