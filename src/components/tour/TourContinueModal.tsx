import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { NeoButton } from '../ui/NeoButton'
import { TagPill } from '../ui/TagPill'
import { GuestBanner } from '../ui/GuestBanner'
import type { Game, GameType, PuzzleDecor } from '../../lib/types'
import {
  TOUR_GAMES,
  tourLabel,
  type TourGame,
  type TourGameScore,
} from '../../lib/tourScore'

type Props = {
  game: Game
  coverUrl?: string
  decor?: PuzzleDecor
  gameType: TourGame
  score: TourGameScore
  onContinue: () => void
}

// Shown after a tour game resolves: reveals the answer (cover + name) like the
// AnswerReveal card, tallies the points earned, and advances to the next game.
export function TourContinueModal({
  game,
  coverUrl,
  decor,
  gameType,
  score,
  onContinue,
}: Props) {
  const index = TOUR_GAMES.indexOf(gameType)
  const nextGame = TOUR_GAMES[index + 1]
  const hasBanner = !!(decor?.bannerText?.trim() || decor?.submitter?.trim())

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') onContinue()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onContinue])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-emphasis/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tour — continue"
    >
      <div className="animate-tour-pop border-neo shadow-neo-lg bg-paper text-ink w-full max-w-sm">
        <div className="flex items-center justify-between border-b-[3px] border-stroke px-5 py-2.5 bg-emphasis text-paper-static">
          <span className="font-display text-[11px] uppercase tracking-wider font-bold">
            The Tour · {index + 1} / {TOUR_GAMES.length}
          </span>
          <span className="font-display text-[11px] uppercase tracking-wider font-bold">
            {tourLabel(gameType)}
          </span>
        </div>

        <div className="p-5 text-center">
          {hasBanner && (
            <div className="flex justify-center pb-3">
              <GuestBanner
                gameType={gameType as GameType}
                submitter={decor!.submitter}
                text={decor!.bannerText}
                color={decor!.bannerColor}
                textColor={decor!.bannerTextColor}
                style={decor!.bannerStyle}
                variant="inline"
              />
            </div>
          )}

          <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
            The game was
          </div>

          {coverUrl && (
            <div className="mt-3 mx-auto w-[150px] border-neo bg-cream-soft overflow-hidden shadow-neo animate-tour-pop">
              <img
                src={coverUrl}
                alt={`${game.name} cover`}
                className="w-full aspect-[3/4] object-cover"
              />
            </div>
          )}

          <div className="font-display text-xl font-bold mt-3 leading-tight">
            {game.name}
          </div>
          {(game.year || game.genre) && (
            <div className="text-[11px] text-ink-soft mt-1 uppercase tracking-wider">
              {[game.year, game.genre].filter(Boolean).join(' · ')}
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            <TagPill tone={score.status === 'solved' ? 'lime' : 'coral'}>
              {score.detail}
            </TagPill>
            <TagPill tone="mustard">+{score.score} pts</TagPill>
          </div>
        </div>

        <div className="px-5 pb-5">
          <NeoButton
            tone="coral"
            size="md"
            onClick={onContinue}
            className="w-full flex items-center justify-center gap-2"
          >
            {nextGame ? (
              <>
                Continue to {tourLabel(nextGame)}
                <ArrowRight className="h-4 w-4 stroke-[3]" />
              </>
            ) : (
              'See your score'
            )}
          </NeoButton>
        </div>
      </div>
    </div>
  )
}
