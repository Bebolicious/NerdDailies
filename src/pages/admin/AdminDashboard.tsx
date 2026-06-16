import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDays, format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { Archive, AlertTriangle, Camera, Grid3x3, Trophy, Music, Eye, ChevronLeft, ChevronRight, LogOut, Scale, Trash2 } from 'lucide-react'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { TagPill } from '../../components/ui/TagPill'
import { useAdminSession } from '../../hooks/useAdminSession'
import { getSupabase } from '../../lib/supabase'
import { cn } from '../../lib/cn'
import { todayISO, weekStartISO } from '../../lib/dates'

type DayStatus = {
  date: string
  screenshot: boolean
  trophy: boolean
  blur: boolean
  soundtrack: boolean
  crossword: boolean
}

// The five daily puzzle tables, all keyed by `puzzle_date`. Weekly games
// (archive / higherlower) are keyed by week and intentionally excluded — a
// single Monday isn't "a day's worth" of those.
const DAILY_TABLES = [
  'screenshot_puzzles',
  'trophy_puzzles',
  'blur_puzzles',
  'soundtrack_puzzles',
  'crossword_puzzles',
] as const

// Nuke every daily game for one date: storage files first, then DB rows.
// Storage layout (see ARCHITECTURE.md §6):
//  - screenshots/<date>/ and soundtracks/<date>/ are exclusive to one game,
//    so the whole date prefix is safe to wipe.
//  - covers/<date>/ is shared by Screenshot + Blur, but since we're removing
//    BOTH on this date, blanket-wiping the prefix is safe here (and also clears
//    orphans left by prior unsaved sessions). Trophy + Crossword have no files.
// Best-effort: collects per-step errors instead of aborting, so DB space is
// still freed even if one storage delete hiccups.
async function deleteDayGames(
  date: string,
): Promise<{ rowsRemoved: number; errors: string[] }> {
  const sb = getSupabase()
  if (!sb) return { rowsRemoved: 0, errors: ['Supabase is not configured.'] }
  const errors: string[] = []

  for (const bucket of ['screenshots', 'soundtracks', 'covers'] as const) {
    const { data: files, error: listErr } = await sb.storage
      .from(bucket)
      .list(date, { limit: 1000 })
    if (listErr) {
      errors.push(`${bucket}: could not list — ${listErr.message}`)
      continue
    }
    if (files && files.length > 0) {
      const paths = files.map((f) => `${date}/${f.name}`)
      const { error: rmErr } = await sb.storage.from(bucket).remove(paths)
      if (rmErr) errors.push(`${bucket}: could not delete files — ${rmErr.message}`)
    }
  }

  let rowsRemoved = 0
  for (const table of DAILY_TABLES) {
    const { error, count } = await sb
      .from(table)
      .delete({ count: 'exact' })
      .eq('puzzle_date', date)
    if (error) errors.push(`${table}: ${error.message}`)
    else rowsRemoved += count ?? 0
  }

  return { rowsRemoved, errors }
}

export function AdminDashboard() {
  const { email, loading } = useAdminSession()
  const nav = useNavigate()
  const [cursor, setCursor] = useState(() => parseISO(todayISO()))
  const [statuses, setStatuses] = useState<DayStatus[]>([])
  const [archiveWeeks, setArchiveWeeks] = useState<Set<string>>(new Set())
  const [higherLowerWeeks, setHigherLowerWeeks] = useState<Set<string>>(new Set())
  const [reloadNonce, setReloadNonce] = useState(0)
  // Day-deletion flow: which date's confirm modal is open, in-flight flag, and
  // the result banner shown after a delete.
  const [confirmDate, setConfirmDate] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null)

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
            crossword: false,
          })),
        )
        setArchiveWeeks(new Set())
        setHigherLowerWeeks(new Set())
        return
      }
      const from = format(monthStart, 'yyyy-MM-dd')
      const to = format(monthEnd, 'yyyy-MM-dd')
      const [s, t, b, m, a, x, h] = await Promise.all([
        sb.from('screenshot_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('trophy_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('blur_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('soundtrack_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('archive_puzzles').select('puzzle_week').gte('puzzle_week', from).lte('puzzle_week', to),
        sb.from('crossword_puzzles').select('puzzle_date').gte('puzzle_date', from).lte('puzzle_date', to),
        sb.from('higherlower_puzzles').select('puzzle_week').gte('puzzle_week', from).lte('puzzle_week', to),
      ])
      const setOf = (rows: { puzzle_date: string }[] | null) =>
        new Set((rows ?? []).map((r) => r.puzzle_date))
      const sSet = setOf(s.data)
      const tSet = setOf(t.data)
      const bSet = setOf(b.data)
      const mSet = setOf(m.data)
      const xSet = setOf(x.data)
      const aSet = new Set(
        (a.data as { puzzle_week: string }[] | null)?.map((r) => r.puzzle_week) ?? [],
      )
      const hSet = new Set(
        (h.data as { puzzle_week: string }[] | null)?.map((r) => r.puzzle_week) ?? [],
      )
      if (cancelled) return
      setArchiveWeeks(aSet)
      setHigherLowerWeeks(hSet)
      setStatuses(
        days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd')
          return {
            date: iso,
            screenshot: sSet.has(iso),
            trophy: tSet.has(iso),
            blur: bSet.has(iso),
            soundtrack: mSet.has(iso),
            crossword: xSet.has(iso),
          }
        }),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [days, monthStart, monthEnd, reloadNonce])

  const onConfirmDelete = useCallback(async () => {
    if (!confirmDate) return
    setDeleting(true)
    setDeleteMsg(null)
    const { rowsRemoved, errors } = await deleteDayGames(confirmDate)
    setDeleting(false)
    setConfirmDate(null)
    setReloadNonce((n) => n + 1)
    if (errors.length > 0) {
      setDeleteMsg(
        `Deleted ${rowsRemoved} game(s) for ${confirmDate}, but hit ${errors.length} issue(s): ${errors.join(' · ')}`,
      )
    } else {
      setDeleteMsg(
        rowsRemoved > 0
          ? `Deleted all ${rowsRemoved} daily game(s) and files for ${confirmDate}.`
          : `Nothing to delete for ${confirmDate}.`,
      )
    }
  }, [confirmDate])

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
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider font-display flex-wrap">
            <Legend tone="bg-coral" label="Screenshot" />
            <Legend tone="bg-blue" label="Trophy" />
            <Legend tone="bg-lime" label="Blur" />
            <Legend tone="bg-mustard" label="Soundtrack" />
            <Legend tone="bg-pink" label="Crossword" />
            <Legend tone="bg-violet" label="Archive (weekly · Mon)" />
            <Legend tone="bg-teal" label="Higher/Lower (weekly · Mon)" />
          </div>
        </div>

        {deleteMsg && (
          <div className="mb-4 border-neo-2 bg-cream-soft px-3 py-2 text-xs font-display flex items-center justify-between gap-3">
            <span>{deleteMsg}</span>
            <button
              type="button"
              onClick={() => setDeleteMsg(null)}
              className="font-display uppercase tracking-wider font-bold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

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
            const hasAnyDaily =
              !!status &&
              (status.screenshot ||
                status.trophy ||
                status.blur ||
                status.soundtrack ||
                status.crossword)
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
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      'font-display text-sm font-bold',
                      // Dark mode: the today cell's bg/text land too close
                      // together, so make today's date pop in red.
                      isToday && 'dark:text-coral',
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  <div className="flex items-center gap-1">
                    {isToday && (
                      <span className="font-display text-[8px] uppercase tracking-wider font-bold">
                        Today
                      </span>
                    )}
                    {hasAnyDaily && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteMsg(null)
                          setConfirmDate(iso)
                        }}
                        aria-label={`Delete all daily games for ${iso}`}
                        title="Delete all daily games for this day"
                        className="border-neo-2 p-0.5 bg-paper text-ink hover:bg-coral hover:text-ink-static transition-colors"
                      >
                        <Trash2 className="h-3 w-3 stroke-[3]" />
                      </button>
                    )}
                  </div>
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
                  <EditorLink
                    iso={iso}
                    type="crossword"
                    set={status?.crossword}
                  />
                  {getDay(d) === 1 && (
                    <>
                      <EditorLink
                        iso={iso}
                        type="archive"
                        set={archiveWeeks.has(weekStartISO(iso))}
                      />
                      <EditorLink
                        iso={iso}
                        type="higherlower"
                        set={higherLowerWeeks.has(weekStartISO(iso))}
                      />
                    </>
                  )}
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
            <NeoButton tone="paper" size="sm" onClick={() => nav(`/admin/crossword/${today}`)}>
              <Grid3x3 className="inline h-3 w-3 mr-1" /> Today's crossword
            </NeoButton>
            <NeoButton
              tone="violet"
              size="sm"
              onClick={() => nav(`/admin/archive/${weekStartISO(today)}`)}
            >
              <Archive className="inline h-3 w-3 mr-1" /> This week's archive
            </NeoButton>
            <NeoButton
              tone="teal"
              size="sm"
              onClick={() => nav(`/admin/higherlower/${weekStartISO(today)}`)}
            >
              <Scale className="inline h-3 w-3 mr-1" /> This week's higher/lower
            </NeoButton>
          </div>
        </div>
      </main>

      {confirmDate && (
        <ConfirmDeleteDay
          date={confirmDate}
          status={statuses.find((s) => s.date === confirmDate)}
          deleting={deleting}
          onCancel={() => setConfirmDate(null)}
          onConfirm={onConfirmDelete}
        />
      )}
    </div>
  )
}

function ConfirmDeleteDay({
  date,
  status,
  deleting,
  onCancel,
  onConfirm,
}: {
  date: string
  status: DayStatus | undefined
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const present = status
    ? (
        [
          ['screenshot', status.screenshot],
          ['trophy', status.trophy],
          ['blur', status.blur],
          ['soundtrack', status.soundtrack],
          ['crossword', status.crossword],
        ] as const
      )
        .filter(([, set]) => set)
        .map(([name]) => name)
    : []
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete all daily games for ${date}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        disabled={deleting}
        className="absolute inset-0 bg-emphasis/70 backdrop-blur-sm cursor-pointer"
      />
      <NeoCard
        tone="paper"
        shadow="lg"
        className="relative w-full max-w-md p-5"
      >
        <div className="flex items-center gap-2 mb-1 text-coral">
          <AlertTriangle className="h-5 w-5 stroke-[3]" />
          <div className="font-display text-[10px] uppercase tracking-[0.2em] font-bold">
            Delete day · {date}
          </div>
        </div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-wider leading-tight mb-3">
          Remove all daily games?
        </h2>
        <p className="text-xs text-ink-soft leading-snug mb-3">
          This permanently deletes every daily puzzle and its uploaded files
          (screenshots, covers, audio) for <strong>{date}</strong> from the
          database and storage. Weekly games (Archive, Higher/Lower) are not
          affected. This cannot be undone.
        </p>
        <div className="border-neo-2 bg-cream-soft px-3 py-2 mb-4">
          <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
            Will remove
          </div>
          {present.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {present.map((name) => (
                <TagPill key={name} tone="coral">
                  {name}
                </TagPill>
              ))}
            </div>
          ) : (
            <div className="text-xs text-ink-soft">
              Nothing set for this day.
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <NeoButton tone="paper" size="sm" onClick={onCancel} disabled={deleting}>
            Cancel
          </NeoButton>
          <NeoButton tone="coral" size="sm" onClick={onConfirm} disabled={deleting}>
            <Trash2 className="inline h-3 w-3 mr-1" />
            {deleting ? 'Deleting…' : 'Delete everything'}
          </NeoButton>
        </div>
      </NeoCard>
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
  type:
    | 'screenshot'
    | 'trophy'
    | 'blur'
    | 'soundtrack'
    | 'archive'
    | 'crossword'
    | 'higherlower'
  set?: boolean
}) {
  const Icon =
    type === 'screenshot'
      ? Camera
      : type === 'trophy'
        ? Trophy
        : type === 'blur'
          ? Eye
          : type === 'soundtrack'
            ? Music
            : type === 'crossword'
              ? Grid3x3
              : type === 'higherlower'
                ? Scale
                : Archive
  const tone =
    type === 'screenshot'
      ? 'bg-coral text-ink-static'
      : type === 'trophy'
        ? 'bg-blue text-paper-static'
        : type === 'blur'
          ? 'bg-lime text-ink-static'
          : type === 'soundtrack'
            ? 'bg-mustard text-ink-static'
            : type === 'crossword'
              ? 'bg-pink text-ink-static'
              : type === 'higherlower'
                ? 'bg-teal text-ink-static'
                : 'bg-violet text-paper-static'
  const isWeekly = type === 'archive' || type === 'higherlower'
  return (
    <Link
      to={`/admin/${type}/${iso}`}
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 border-neo-2 text-[9px] uppercase tracking-wider font-display font-bold transition-opacity',
        set ? tone : 'bg-cream-soft opacity-60 hover:opacity-100',
      )}
    >
      <Icon className="h-2.5 w-2.5 stroke-[3]" />
      {set ? (isWeekly ? 'week set' : 'set') : isWeekly ? '+ week' : '+ add'}
    </Link>
  )
}
