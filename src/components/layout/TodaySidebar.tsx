import { useEffect, useState } from 'react'
import { Archive, Camera, Eye, EyeOff, Flag, Grid3x3, LayoutGrid, Music, Scale, Trophy, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { NeoCard } from '../ui/NeoCard'
import { TagPill } from '../ui/TagPill'
import { todayISO, weekNumber, weekStartISO } from '../../lib/dates'
import { getResult } from '../../lib/scoreStore'
import { useBlurPuzzle } from '../../hooks/usePuzzle'
import { TOUR_REQUEST_EVENT } from '../../lib/tourState'
import type { GameType } from '../../lib/types'
import { cn } from '../../lib/cn'

type GameTone = 'coral' | 'blue' | 'mustard' | 'lime' | 'violet' | 'pink' | 'teal' | 'orange'

type GameEntry = {
  type: GameType
  title: string
  blurb: string
  path: string
  tone: GameTone
  icon: typeof Camera
  cadence: 'daily' | 'weekly'
  disabled?: boolean
}

const GAMES: GameEntry[] = [
  { type: 'screenshot', title: 'Screenshot', blurb: 'Guess the game based on 6 screenshots.', path: '/screenshot', tone: 'coral', icon: Camera, cadence: 'daily' },
  { type: 'trophy', title: 'Trophy', blurb: 'Guess the game based on a trophy/achievement.', path: '/trophy', tone: 'blue', icon: Trophy, cadence: 'daily' },
  { type: 'blur', title: 'Blur Reveal', blurb: 'Guess the game from its blurred cover.', path: '/blur', tone: 'lime', icon: Eye, cadence: 'daily' },
  { type: 'soundtrack', title: 'Soundtrack', blurb: 'Name the game by only listening.', path: '/soundtrack', tone: 'mustard', icon: Music, cadence: 'daily' },
  { type: 'connections', title: 'Connections', blurb: 'Sort 16 words into 4 secret groups of four.', path: '/connections', tone: 'orange', icon: LayoutGrid, cadence: 'daily' },
  { type: 'archive', title: 'The Archive', blurb: 'Weekly escape room. Spend candles on clues to name two mystery games and the thing they share.', path: '/archive', tone: 'violet', icon: Archive, cadence: 'weekly' },
  { type: 'crossword', title: 'Mini Crossword', blurb: 'Weekly. Fill the mini — Across and Down clues, no timer.', path: '/crossword', tone: 'pink', icon: Grid3x3, cadence: 'weekly' },
  { type: 'higherlower', title: 'Higher / Lower', blurb: 'Weekly gauntlet — pick which game is higher across 15 stat showdowns.', path: '/higherlower', tone: 'teal', icon: Scale, cadence: 'weekly' },
]

const DAILY_GAMES = GAMES.filter((g) => g.cadence === 'daily')
const WEEKLY_GAMES = GAMES.filter((g) => g.cadence === 'weekly')

const ACTIVE_TILE_BG: Record<GameTone, string> = {
  coral: 'bg-coral text-ink-static',
  blue: 'bg-blue text-paper-static',
  mustard: 'bg-mustard text-ink-static',
  lime: 'bg-lime text-ink-static',
  violet: 'bg-violet text-paper-static',
  pink: 'bg-pink text-ink-static',
  teal: 'bg-teal text-ink-static',
  orange: 'bg-orange text-ink-static',
}

const CARD_ICON_BG: Record<GameTone, string> = {
  coral: 'bg-coral text-ink-static',
  blue: 'bg-blue text-paper-static',
  lime: 'bg-lime text-ink-static',
  mustard: 'bg-mustard text-ink-static',
  violet: 'bg-violet text-paper-static',
  pink: 'bg-pink text-ink-static',
  teal: 'bg-teal text-ink-static',
  orange: 'bg-orange text-ink-static',
}

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

// Results are read straight from localStorage at render, so the sidebar needs a
// nudge to re-read when a round finishes on the page next to it. Route changes
// already re-render it; this covers finishing without navigating.
function useResultsVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    function bump() {
      setV((n) => n + 1)
    }
    window.addEventListener('dailies:result-saved', bump)
    return () => window.removeEventListener('dailies:result-saved', bump)
  }, [])
  return v
}

function SidebarContent() {
  const today = todayISO()
  const location = useLocation()
  useResultsVersion()

  // Cached module-level fetch shared with /blur and TourController — one query
  // per session, not one per page. Only used to decide whether today's drop
  // carries the Back Cover hard-mode round.
  const blurPuzzle = useBlurPuzzle(today)
  const backAvailable = !!blurPuzzle?.back

  return (
    <>
      <div className="pt-5" />

      {WEEKLY_GAMES.length > 0 && (
        <WeeklyBox today={today} pathname={location.pathname} />
      )}

      <div className="px-6 flex flex-col gap-3">
        <TourStartButton />

        {DAILY_GAMES.map((g) => {
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
          const showHardTile = g.type === 'blur' && backAvailable

          return (
            // The card is a plain box with a stretched link filling it, rather
            // than a <Link> wrapper — Blur's hard-mode tile is a second link
            // inside the card, and nesting anchors is invalid HTML.
            <NeoCard
              key={g.type}
              tone={active ? g.tone : 'paper'}
              shadow="md"
              className="group p-3 relative overflow-hidden transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-neo-lg active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Link
                to={g.path}
                aria-label={g.title}
                className="absolute inset-0 z-0"
              />

              {/* Content sits above the stretched link but lets clicks fall
                  through to it, so the whole card stays one big target. */}
              <div className="relative z-10 pointer-events-none">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'border-neo-2 p-1.5 shrink-0',
                      active ? 'bg-paper text-ink' : CARD_ICON_BG[g.tone],
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
                <div
                  className={cn(
                    'flex items-center mt-2',
                    showHardTile ? 'justify-between' : 'justify-end',
                  )}
                >
                  {showHardTile && (
                    <HardModeTile
                      today={today}
                      active={location.pathname.startsWith('/blur/back')}
                    />
                  )}
                  <StatusPill status={status} cadence="daily" />
                </div>
              </div>
            </NeoCard>
          )
        })}
      </div>

      <div className="pb-4" />
    </>
  )
}

// The Blur card's second entry point: a square icon tile, same shape as the
// Weekly box tiles, sitting where the "Day #N" label used to. Corner dot is
// lime when hard mode was solved, coral when it was failed.
function HardModeTile({ today, active }: { today: string; active: boolean }) {
  const result = getResult(today, 'blurback')
  const solved = result?.status === 'solved'
  const lost = result?.status === 'lost'

  return (
    <Link
      to="/blur/back"
      title={`Back Cover · hard mode${solved ? ' · solved' : lost ? ' · failed' : ''}`}
      aria-label={`Blur Reveal Back Cover, hard mode${solved ? ', solved' : lost ? ', failed' : ''}`}
      className={cn(
        'pointer-events-auto border-neo-2 p-1.5 shadow-neo-sm transition-all relative',
        'hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo',
        'active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
        active
          ? 'bg-emphasis text-paper-static'
          : 'bg-cream-soft text-ink hover:bg-paper',
      )}
    >
      <EyeOff className="h-4 w-4 stroke-[2.5]" />
      {(solved || lost) && !active && (
        <span
          className={cn(
            'absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-[2px] border-stroke',
            solved ? 'bg-lime' : 'bg-coral',
          )}
          aria-hidden
        />
      )}
    </Link>
  )
}

// Full-width, short-height CTA with an animated gradient border. Opens the tour
// invite modal (its Accept then navigates to the first game).
function TourStartButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_REQUEST_EVENT))}
      aria-label="Start The Tour"
      className="tour-cta-border block w-full p-[3px] shadow-neo transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-neo-lg active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      <span className="flex items-center justify-center gap-2 bg-paper text-ink px-3 py-1.5 font-display text-xs uppercase tracking-wider font-bold">
        <Flag className="h-3.5 w-3.5 stroke-[3]" />
        Start The Tour
      </span>
    </button>
  )
}

function WeeklyBox({
  today,
  pathname,
}: {
  today: string
  pathname: string
}) {
  const weekKey = weekStartISO(today)
  return (
    <div className="px-6 pb-4">
      <NeoCard tone="paper" shadow="md" className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-display text-[10px] uppercase tracking-[0.2em] font-bold">
            Weekly
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-display">
            Week #{weekNumber(today)}
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          {WEEKLY_GAMES.map((g) => {
            const Icon = g.icon

            if (g.disabled) {
              return (
                <div
                  key={g.type}
                  title={`${g.title} · reworking`}
                  aria-label={`${g.title} (reworking)`}
                  className="border-neo-2 shadow-neo-sm relative overflow-hidden bg-cream-soft text-ink-soft cursor-not-allowed select-none"
                >
                  <div className="p-2.5 opacity-50">
                    <Icon className="h-5 w-5 stroke-[2.5]" />
                  </div>
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[160%] bg-[#dc2626] text-paper-static text-center font-display text-[8px] font-bold uppercase tracking-wider leading-none py-[2px]">
                    Reworking
                  </span>
                </div>
              )
            }

            const active = pathname.startsWith(g.path)
            const result = getResult(weekKey, g.type)
            const solved = result?.status === 'solved'
            return (
              <Link
                key={g.type}
                to={g.path}
                title={`${g.title}${solved ? ' · solved' : ''}`}
                aria-label={g.title}
                className={cn(
                  'border-neo-2 p-2.5 shadow-neo-sm transition-all relative',
                  'hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo',
                  'active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
                  active
                    ? ACTIVE_TILE_BG[g.tone]
                    : 'bg-cream-soft text-ink hover:bg-paper',
                )}
              >
                <Icon className="h-5 w-5 stroke-[2.5]" />
                {solved && !active && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-lime border-[2px] border-stroke"
                    aria-hidden
                  />
                )}
              </Link>
            )
          })}
        </div>
      </NeoCard>
    </div>
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
