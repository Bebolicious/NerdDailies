import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { NeoCard } from '../ui/NeoCard'
import { NeoButton } from '../ui/NeoButton'
import { TagPill } from '../ui/TagPill'
import type { Game } from '../../lib/types'
import { cn } from '../../lib/cn'

type ShareTone = 'blue' | 'mustard' | 'lime' | 'coral'

type Props = {
  game: Game
  /** Optional cover art thumbnail. Omit when no cover is available. */
  coverUrl?: string
  status: 'solved' | 'lost'
  guessCount: number
  /** When set, render a Share button in the given tone. */
  shareTone?: ShareTone
  /** Game noun used in the copied share text, e.g. "soundtrack" → "the daily
   *  soundtrack mini-game". Required for the Share button to do anything. */
  shareLabel?: string
  className?: string
}

// The uniform "today's game was" reveal card shared by every single-answer
// game (Screenshot, Blur, Trophy, Soundtrack). Weekly games and the crossword
// don't resolve to one game, so they don't use it.
//
// This card is also the future home of affiliate "Get this game" links — keep
// the answer (name + cover) the focal point so that row slots in cleanly later.
export function AnswerReveal({
  game,
  coverUrl,
  status,
  guessCount,
  shareTone,
  shareLabel,
  className,
}: Props) {
  // `nonce` bumps per click so the pop animation re-fires on repeat shares
  // without restarting on unrelated re-renders.
  const [nonce, setNonce] = useState(0)
  const [shared, setShared] = useState(false)
  const resetRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(resetRef.current), [])

  async function handleShare() {
    const text = `Completed the daily ${shareLabel} mini-game in: ${guessCount} guesses`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard can reject (permissions / insecure context) — still flash the
      // confirmation so the click feels responsive; nothing else to fall back to.
    }
    setNonce((n) => n + 1)
    setShared(true)
    clearTimeout(resetRef.current)
    resetRef.current = setTimeout(() => setShared(false), 1600)
  }

  return (
    <NeoCard tone="paper" shadow="sm" className={cn('p-3', className)}>
      <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
        Today's game was
      </div>

      {coverUrl && (
        <div className="mt-2 mx-auto w-[170px] border-neo bg-cream-soft overflow-hidden">
          <img
            src={coverUrl}
            alt={`${game.name} cover`}
            className="w-full aspect-[3/4] object-cover"
          />
        </div>
      )}

      <div className="font-display text-lg font-bold mt-2 leading-tight">
        {game.name}
      </div>
      <div className="text-[11px] text-ink-soft mt-1 uppercase tracking-wider">
        {game.year} · {game.genre}
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <TagPill tone={status === 'solved' ? 'lime' : 'coral'}>
          {status === 'solved' ? `Solved in ${guessCount}` : 'Streak broken'}
        </TagPill>
        {shareTone && (
          <div className="relative">
            <NeoButton tone={shareTone} size="sm" onClick={handleShare}>
              <Share2 className="inline h-3 w-3 mr-1" /> Share
            </NeoButton>
            {shared && (
              <div
                key={nonce}
                className="animate-share-pop pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap border-neo bg-lime px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-ink-static shadow-neo"
              >
                Share da shi! 🎉
                <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-stroke bg-lime" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Affiliate "Get this game" links will mount here later (Humble / GOG /
          GMG via Awin). Keep them below the answer so the reveal stays the
          focal point. See monetization/IDEAS.md §B. */}
    </NeoCard>
  )
}
