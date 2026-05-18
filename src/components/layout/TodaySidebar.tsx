import { useEffect } from 'react'
import { Camera, Music, Trophy, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { NeoCard } from '../ui/NeoCard'
import { TagPill } from '../ui/TagPill'
import { useCountdownToMidnight } from '../../hooks/useCountdown'
import { dayNumber, formatLong, todayISO } from '../../lib/dates'
import { getResult } from '../../lib/scoreStore'
import type { GameType } from '../../lib/types'
import { cn } from '../../lib/cn'

const GAMES: Array<{
  type: GameType
  title: string
  blurb: string
  path: string
  tone: 'coral' | 'blue' | 'mustard'
  icon: typeof Camera
}> = [
  { type: 'screenshot', title: 'Screenshot', blurb: 'Guess the game based on 6 screenshots.', path: '/screenshot', tone: 'coral', icon: Camera },
  { type: 'trophy', title: 'Trophy', blurb: 'Guess the game based on a trophy/achievement.', path: '/trophy', tone: 'blue', icon: Trophy },
  { type: 'soundtrack', title: 'Soundtrack', blurb: 'Name that theme.', path: '/soundtrack', tone: 'mustard', icon: Music },
]

type Props = {
  mobileOpen?: boolean
  onClose?: () => void
}

export function TodaySidebar({ mobileOpen, onClose }: Props) {
  const location = useLocation()

  useEffect(() => {
    if (mobileOpen) onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen, onClose])

  return (
    <>
      <aside className="hidden lg:block w-[340px] shrink-0 border-l-[3px] border-stroke bg-cream-soft min-h-full">
        <SidebarContent />
      </aside>

      <div
        className={cn(
          'lg:hidden fixed inset-0 z-50',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={onClose}
          className={cn(
            'absolute inset-0 bg-emphasis/60 backdrop-blur-sm transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Today's games"
          className={cn(
            'absolute right-0 top-0 bottom-0 w-[340px] max-w-[85vw] bg-cream-soft border-l-[3px] border-stroke overflow-y-auto transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <button
            onClick={onClose}
            aria-label="Close games menu"
            className="absolute top-4 right-4 z-10 border-neo-2 p-2 bg-paper hover:bg-coral hover:text-ink-static transition-colors"
          >
            <X className="h-3.5 w-3.5 stroke-[3]" />
          </button>
          <SidebarContent />
        </aside>
      </div>
    </>
  )
}

function SidebarContent() {
  const today = todayISO()
  const countdown = useCountdownToMidnight()
  const location = useLocation()

  return (
    <>
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="font-display text-xs uppercase tracking-[0.2em] font-bold">
          Today
        </div>
        <div className="text-[10px] uppercase tracking-wider text-ink-soft">
          {formatLong(today)}
        </div>
      </div>

      <div className="px-6 flex flex-col gap-4">
        {GAMES.map((g) => {
          const result = getResult(today, g.type)
          const active = location.pathname.startsWith(g.path)
          const status: 'play' | 'in_progress' | 'solved' | 'lost' = result
            ? result.status === 'solved'
              ? 'solved'
              : 'lost'
            : active
              ? 'in_progress'
              : 'play'
          const Icon = g.icon
          const disabled = g.type === 'soundtrack'

          const cardInner = (
            <NeoCard
              tone={active ? g.tone : 'paper'}
              shadow="md"
              className={cn(
                'p-4 relative overflow-hidden',
                disabled
                  ? 'opacity-90'
                  : 'transition-all group-hover:-translate-y-0.5 group-hover:-translate-x-0.5 group-hover:shadow-neo-lg group-active:translate-x-[2px] group-active:translate-y-[2px] group-active:shadow-none',
              )}
            >
              <div className={cn('flex items-start gap-3', disabled && 'opacity-50')}>
                <div
                  className={cn(
                    'border-neo-2 p-2 shrink-0',
                    active
                      ? 'bg-paper text-ink'
                      : g.tone === 'coral'
                        ? 'bg-coral text-ink-static'
                        : g.tone === 'blue'
                          ? 'bg-blue text-paper-static'
                          : 'bg-mustard text-ink-static',
                  )}
                >
                  <Icon className="h-5 w-5 stroke-[2.5]" />
                </div>
                <div className="flex-1">
                  <div className="font-display text-sm uppercase tracking-wider font-bold leading-tight">
                    {g.title}
                  </div>
                  <div className="text-xs mt-1 opacity-80">{g.blurb}</div>
                </div>
              </div>
              <div className={cn('flex items-center justify-between mt-3', disabled && 'opacity-50')}>
                <div className="font-display text-[10px] uppercase tracking-wider opacity-80">
                  Day #{dayNumber(today)}
                </div>
                <StatusPill status={status} />
              </div>
              {disabled && <ComingSoonBanner />}
            </NeoCard>
          )

          if (disabled) {
            return (
              <div
                key={g.type}
                aria-disabled="true"
                className="block cursor-not-allowed select-none"
              >
                {cardInner}
              </div>
            )
          }

          return (
            <Link key={g.type} to={g.path} className="block group">
              {cardInner}
            </Link>
          )
        })}
      </div>

      <div className="px-6 mt-6 pb-6">
        <NeoCard tone="ink" shadow="md" className="p-4">
          <div className="font-display text-[10px] uppercase tracking-[0.2em] opacity-70 mb-2">
            Next drop in
          </div>
          <div className="font-display text-3xl font-bold tracking-wider text-lime">
            {countdown}
          </div>
          <div className="font-display text-[10px] uppercase tracking-wider opacity-70 mt-2">
            New puzzles @ 00:00 local
          </div>
        </NeoCard>
      </div>
    </>
  )
}

function ComingSoonBanner() {
  return (
    <div
      className="pointer-events-none absolute inset-x-[-20%] top-1/2 -translate-y-1/2 -rotate-6 border-y-[3px] border-stroke py-1.5 text-center font-display text-sm uppercase tracking-[0.3em] font-bold text-ink-static shadow-neo-sm"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, #f4b73e 0 12px, #1b1b3a 12px 22px)',
      }}
    >
      <span className="inline-block bg-mustard px-3 py-0.5 border-neo-2">
        Coming soon
      </span>
    </div>
  )
}

function StatusPill({
  status,
}: {
  status: 'play' | 'in_progress' | 'solved' | 'lost'
}) {
  switch (status) {
    case 'solved':
      return <TagPill tone="lime">★ Solved</TagPill>
    case 'in_progress':
      return <TagPill tone="paper">In progress</TagPill>
    case 'lost':
      return <TagPill tone="coral">Try tomorrow</TagPill>
    default:
      return <TagPill tone="paper">Play →</TagPill>
  }
}
