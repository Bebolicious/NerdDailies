import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDays, format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { Camera, Trophy, Music, Eye, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { TagPill } from '../../components/ui/TagPill'
import { useAdminSession } from '../../hooks/useAdminSession'
import { getSupabase } from '../../lib/supabase'
import { cn } from '../../lib/cn'
import { todayISO } from '../../lib/dates'

type DayStatus = {
  date: string
  screenshot: boolean
  trophy: boolean
  blur: boolean
  soundtrack: boolean
}

export function AdminDashboard() {
  const { email, loading } = useAdminSession()
  const nav = useNavigate()
  const [cursor, setCursor] = useState(() => parseISO(todayISO()))
  const [statuses, setStatuses] = useState<DayStatus[]>([])

  useEffect(() => {
    if (!loading && !email) nav('/admin/login')
  }, [email, loading, nav])

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const days = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart, monthEnd],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      if (!sb) {
        setStatuses(
          days.map((d) => ({
            date: format(d, 'yyyy-MM-dd'),
            screenshot: false,
            trophy: false,
            blur: false,
            soundtrack: false,
          })),
        )
        return
      }
      const from = format(monthStart, 'yyyy-MM-dd')
      const to = format(monthEnd, 'yyyy-MM-dd')
      const [s, t, b, m] = await Promise.all([
        sb.from('screenshot_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('trophy_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('blur_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('soundtrack_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
      ])
      const setOf = (rows: { puzzle_date: string }[] | null) =>
        new Set((rows ?? []).map((r) => r.puzzle_date))
      const sSet = setOf(s.data)
      const tSet = setOf(t.data)
      const bSet = setOf(b.data)
      const mSet = setOf(m.data)
      if (cancelled) return
      setStatuses(
        days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd')
          return {
            date: iso,
            screenshot: sSet.has(iso),
            trophy: tSet.has(iso),
            blur: bSet.has(iso),
            soundtrack: mSet.has(iso),
          }
        }),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [days, monthStart, monthEnd])

  if (loading) return null

  const blankLeading = getDay(monthStart) // 0 = Sunday
  const today = todayISO()

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b-[3px] border-stroke px-6 py-4 flex items-center justify-between bg-paper">
        <div>
          <div className="font-display text-2xl font-bold uppercase tracking-wider">
            Dailies Admin
          </div>
          <div className="text-xs text-ink-soft mt-1">
            Schedule a month at a time. {email && <span>· signed in as {email}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="font-display text-xs uppercase tracking-wider font-bold hover:text-coral">
            ← Back to app
          </Link>
          <NeoButton
            tone="paper"
            size="sm"
            onClick={async () => {
              await getSupabase()?.auth.signOut()
              nav('/admin/login')
            }}
          >
            <LogOut className="inline h-3 w-3 mr-1" /> Sign out
          </NeoButton>
        </div>
      </header>

      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <NeoButton
              tone="paper"
              size="sm"
              onClick={() => setCursor((c) => addDays(startOfMonth(c), -1))}
            >
              <ChevronLeft className="inline h-3 w-3" />
            </NeoButton>
            <div className="font-display text-xl font-bold uppercase tracking-wider">
              {format(cursor, 'MMMM yyyy')}
            </div>
            <NeoButton
              tone="paper"
              size="sm"
              onClick={() => setCursor((c) => addDays(endOfMonth(c), 1))}
            >
              <ChevronRight className="inline h-3 w-3" />
            </NeoButton>
          </div>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider font-display">
            <Legend tone="bg-coral" label="Screenshot" />
            <Legend tone="bg-blue" label="Trophy" />
            <Legend tone="bg-lime" label="Blur" />
            <Legend tone="bg-mustard" label="Soundtrack" />
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div
              key={d}
              className="font-display text-[10px] uppercase tracking-wider text-ink-soft text-center"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: blankLeading }).map((_, i) => (
            <div key={`b-${i}`} />
          ))}
          {days.map((d) => {
            const iso = format(d, 'yyyy-MM-dd')
            const status = statuses.find((s) => s.date === iso)
            const isToday = iso === today
            return (
              <NeoCard
                key={iso}
                tone="paper"
                shadow="sm"
                className={cn(
                  'p-2 flex flex-col gap-2 min-h-[110px]',
                  isToday && 'bg-lime text-ink-static',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold">
                    {format(d, 'd')}
                  </span>
                  {isToday && (
                    <span className="font-display text-[8px] uppercase tracking-wider font-bold">
                      Today
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <EditorLink
                    iso={iso}
                    type="screenshot"
                    set={status?.screenshot}
                  />
                  <EditorLink iso={iso} type="trophy" set={status?.trophy} />
                  <EditorLink iso={iso} type="blur" set={status?.blur} />
                  <EditorLink
                    iso={iso}
                    type="soundtrack"
                    set={status?.soundtrack}
                  />
                </div>
              </NeoCard>
            )
          })}
        </div>

        <div className="mt-8">
          <TagPill tone="paper" className="mb-3">
            Quick jump
          </TagPill>
          <div className="flex flex-wrap gap-3">
            <NeoButton tone="coral" size="sm" onClick={() => nav(`/admin/screenshot/${today}`)}>
              <Camera className="inline h-3 w-3 mr-1" /> Today's screenshot
            </NeoButton>
            <NeoButton tone="blue" size="sm" onClick={() => nav(`/admin/trophy/${today}`)}>
              <Trophy className="inline h-3 w-3 mr-1" /> Today's trophy
            </NeoButton>
            <NeoButton tone="lime" size="sm" onClick={() => nav(`/admin/blur/${today}`)}>
              <Eye className="inline h-3 w-3 mr-1" /> Today's blur
            </NeoButton>
            <NeoButton tone="mustard" size="sm" onClick={() => nav(`/admin/soundtrack/${today}`)}>
              <Music className="inline h-3 w-3 mr-1" /> Today's soundtrack
            </NeoButton>
          </div>
        </div>
      </main>
    </div>
  )
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('w-3 h-3 border-neo-2', tone)} />
      {label}
    </span>
  )
}

function EditorLink({
  iso,
  type,
  set,
}: {
  iso: string
  type: 'screenshot' | 'trophy' | 'blur' | 'soundtrack'
  set?: boolean
}) {
  const Icon =
    type === 'screenshot'
      ? Camera
      : type === 'trophy'
        ? Trophy
        : type === 'blur'
          ? Eye
          : Music
  const tone =
    type === 'screenshot'
      ? 'bg-coral text-ink-static'
      : type === 'trophy'
        ? 'bg-blue text-paper-static'
        : type === 'blur'
          ? 'bg-lime text-ink-static'
          : 'bg-mustard text-ink-static'
  return (
    <Link
      to={`/admin/${type}/${iso}`}
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 border-neo-2 text-[9px] uppercase tracking-wider font-display font-bold transition-opacity',
        set ? tone : 'bg-cream-soft opacity-60 hover:opacity-100',
      )}
    >
      <Icon className="h-2.5 w-2.5 stroke-[3]" />
      {set ? 'set' : '+ add'}
    </Link>
  )
}
