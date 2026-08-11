import { Camera, Eye, EyeOff, LayoutGrid, Music, Trophy, Check, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { NeoCard } from '../components/ui/NeoCard'
import { REPLAY_WINDOW_DAYS, realTodayISO } from '../lib/dates'
import { getResult } from '../lib/scoreStore'
import type { GameType } from '../lib/types'
import { cn } from '../lib/cn'

type ReplayGame = {
  type: GameType
  label: string
  icon: typeof Camera
  tone: 'coral' | 'blue' | 'lime' | 'mustard' | 'orange' | 'ink'
  /** Only drops on some days — hidden entirely unless it was played. */
  occasional?: boolean
}

const DAILY_GAMES: ReplayGame[] = [
  { type: 'screenshot', label: 'Screenshot', icon: Camera, tone: 'coral' },
  { type: 'trophy', label: 'Trophy', icon: Trophy, tone: 'blue' },
  { type: 'blur', label: 'Blur Reveal', icon: Eye, tone: 'lime' },
  { type: 'blurback', label: 'Back Cover (hard)', icon: EyeOff, tone: 'ink', occasional: true },
  { type: 'soundtrack', label: 'Soundtrack', icon: Music, tone: 'mustard' },
  { type: 'connections', label: 'Connections', icon: LayoutGrid, tone: 'orange' },
]

export function Replay() {
  const today = realTodayISO()
  const days: string[] = []
  for (let i = REPLAY_WINDOW_DAYS; i >= 1; i--) {
    days.push(format(addDays(parseISO(today), -i), 'yyyy-MM-dd'))
  }

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wider mb-1">
        Replay
      </h1>
      <p className="text-sm text-ink-soft mb-6">
        Missed a day? Play any of the previous {REPLAY_WINDOW_DAYS} drops.
        Older puzzles aren't kept around.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {days.map((dateISO, idx) => {
          const isYesterday = idx === days.length - 1
          const dateObj = parseISO(dateISO)
          const big = format(dateObj, 'd/M')
          const dow = format(dateObj, 'EEE').toUpperCase()
          const md = format(dateObj, 'MMM d').toUpperCase()
          const subtitle = isYesterday ? 'YESTERDAY' : `${dow}, ${md}`

          return (
            <Link
              key={dateISO}
              to={`/screenshot?date=${dateISO}`}
              className="block group"
            >
              <NeoCard
                tone="paper"
                shadow="md"
                className="p-5 flex flex-col items-center transition-all group-hover:-translate-y-0.5 group-hover:-translate-x-0.5 group-hover:shadow-neo-lg group-active:translate-x-[2px] group-active:translate-y-[2px] group-active:shadow-none"
              >
                <div className="font-display text-5xl sm:text-6xl font-bold text-ink-soft tabular-nums leading-none py-6">
                  {big}
                </div>
                <DailyDots dateISO={dateISO} />
              </NeoCard>
              <div className="text-center font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mt-2">
                {subtitle}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function DailyDots({ dateISO }: { dateISO: string }) {
  // Back Cover only runs on some days, and we can't know which without a
  // query — so it earns a dot only on days it was actually played, and the
  // denominator follows suit rather than showing a permanent x/6.
  const games = DAILY_GAMES.filter(
    (g) => !g.occasional || !!getResult(dateISO, g.type),
  )
  const solvedCount = games.filter(
    (g) => getResult(dateISO, g.type)?.status === 'solved',
  ).length

  return (
    <div className="w-full flex flex-col items-center gap-2 mt-2">
      <div className="flex items-center gap-1.5">
        {games.map((g) => {
          const result = getResult(dateISO, g.type)
          const solved = result?.status === 'solved'
          const lost = result?.status === 'lost'
          const Icon = g.icon
          return (
            <div
              key={g.type}
              title={`${g.label}${solved ? ' · solved' : lost ? ' · failed' : ''}`}
              className={cn(
                'border-neo-2 p-1.5 relative',
                solved
                  ? g.tone === 'coral'
                    ? 'bg-coral text-ink-static'
                    : g.tone === 'blue'
                      ? 'bg-blue text-paper-static'
                      : g.tone === 'lime'
                        ? 'bg-lime text-ink-static'
                        : g.tone === 'mustard'
                          ? 'bg-mustard text-ink-static'
                          : g.tone === 'ink'
                            ? 'bg-emphasis text-paper-static'
                            : 'bg-orange text-ink-static'
                  : lost
                    ? 'bg-coral text-ink-static'
                    : 'bg-paper text-ink-soft opacity-50',
              )}
            >
              <Icon className="h-3.5 w-3.5 stroke-[2.5]" />
              {solved && (
                <Check
                  className="absolute -top-1.5 -right-1.5 h-3 w-3 stroke-[4] bg-lime border-[2px] border-stroke text-ink-static rounded-full p-[1px]"
                  aria-hidden
                />
              )}
              {lost && (
                <X
                  className="absolute -top-1.5 -right-1.5 h-3 w-3 stroke-[4] bg-coral border-[2px] border-stroke text-ink-static rounded-full p-[1px]"
                  aria-hidden
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
        {solvedCount === 0
          ? 'Not played'
          : `${solvedCount}/${games.length} solved`}
      </div>
    </div>
  )
}
