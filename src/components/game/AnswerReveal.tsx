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
  className,
}: Props) {
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
          <NeoButton tone={shareTone} size="sm">
            <Share2 className="inline h-3 w-3 mr-1" /> Share
          </NeoButton>
        )}
      </div>

      {/* Affiliate "Get this game" links will mount here later (Humble / GOG /
          GMG via Awin). Keep them below the answer so the reveal stays the
          focal point. See monetization/IDEAS.md §B. */}
    </NeoCard>
  )
}
