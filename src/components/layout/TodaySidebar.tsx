import { useEffect } from 'react'
import { Archive, Camera, Eye, Music, Trophy, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { NeoCard } from '../ui/NeoCard'
import { TagPill } from '../ui/TagPill'
import { useCountdownToMidnight } from '../../hooks/useCountdown'
import { dayNumber, formatLong, todayISO, weekNumber, weekStartISO } from '../../lib/dates'
import { getResult } from '../../lib/scoreStore'
import type { GameType } from '../../lib/types'
import { cn } from '../../lib/cn'

const GAMES: Array<{
  type: GameType
  title: string
  blurb: string
  path: string
  tone: 'coral' | 'blue' | 'mustard' | 'lime' | 'violet'
  icon: typeof Camera
  cadence: 'daily' | 'weekly'
}> = [
  { type: 'screenshot', title: 'Screenshot', blurb: 'Guess the game based on 6 screenshots.', path: '/screenshot', tone: 'coral', icon: Camera, cadence: 'daily' },
  { type: 'trophy', title: 'Trophy', blurb: 'Guess the game based on a trophy/achievement.', path: '/trophy', tone: 'blue', icon: Trophy, cadence: 'daily' },
  { type: 'blur', title: 'Blur Reveal', blurb: 'Guess the game from its blurred cover — each miss sharpens it.', path: '/blur', tone: 'lime', icon: Eye, cadence: 'daily' },
  { type: 'soundtrack', title: 'Soundtrack', blurb: 'Name the game by only listening.', path: '/soundtrack', tone: 'mustard', icon: Music, cadence: 'daily' },
  { type: 'archive', title: 'The Archive', blurb: 'Weekly. Spend candles in a dark archive room to identify a mystery game.', path: '/archive', tone: 'violet', icon: Archive, cadence: 'weekly' },
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
          const resultKey = g.cadence === 'weekly' ? weekStartISO(today) : today
          const result = getResult(resultKey, g.type)
          const active = location.pathname.startsWith(g.path)
          const status: 'play' | 'in_progress' | 'solved' | 'lost' = result
            ? result.status === 'solved'
              ? 'solved'
              : 'lost'
            : active
              ? 'in_progress'
              : 'play'
          const Icon = g.icon

          return (
            <Link key={g.type} to={g.path} className="block group">
              <NeoCard
                tone={active ? g.tone : 'paper'}
                shadow="md"
                className="p-4 relative overflow-hidden transition-all group-hover:-translate-y-0.5 group-hover:-translate-x-0.5 group-hover:shadow-neo-lg group-active:translate-x-[2px] group-active:translate-y-[2px] group-active:shadow-none"
              >
                {g.cadence === 'weekly' && (
                  <div
                    className="absolute top-3 -right-8 w-28 text-center rotate-45 bg-mustard text-ink-static border-y-2 border-stroke font-display text-[9px] uppercase tracking-[0.15em] font-bold py-0.5 shadow-neo-sm pointer-events-none"
                    aria-hidden
                  >
                    Weekly!
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'border-neo-2 p-2 shrink-0',
                      active
                        ? 'bg-paper text-ink'
                        : g.tone === 'coral'
                          ? 'bg-coral text-ink-static'
                          : g.tone === 'blue'
                            ? 'bg-blue text-paper-static'
                            : g.tone === 'lime'
                              ? 'bg-lime text-ink-static'
                              : g.tone === 'violet'
                                ? 'bg-violet text-paper-static'
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
                <div className="flex items-center justify-between mt-3">
                  <div className="font-display text-[10px] uppercase tracking-wider opacity-80">
                    {g.cadence === 'weekly'
                      ? `Week #${weekNumber(today)} · weekly`
                      : `Day #${dayNumber(today)}`}
                  </div>
                  <StatusPill status={status} cadence={g.cadence} />
                </div>
              </NeoCard>
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

function StatusPill({
  status,
  cadence,
}: {
  status: 'play' | 'in_progress' | 'solved' | 'lost'
  cadence: 'daily' | 'weekly'
}) {
  switch (status) {
    case 'solved':
      return <TagPill tone="lime">★ Solved</TagPill>
    case 'in_progress':
      return <TagPill tone="paper">In progress</TagPill>
    case 'lost':
      return (
        <TagPill tone="coral">
          {cadence === 'weekly' ? 'Try next week' : 'Try tomorrow'}
        </TagPill>
      )
    default:
      return <TagPill tone="paper">Play →</TagPill>
  }
}
