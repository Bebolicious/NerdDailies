import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'

// The day the project conceptually launches. Day #1 = this date.
// You can change this once and the day numbering stays consistent.
export const PROJECT_EPOCH = '2026-04-01'

const OVERRIDE_KEY = 'dailies/dev-date-override'
const OVERRIDE_RE = /^\d{4}-\d{2}-\d{2}$/

// In dev only, allow overriding "today" via ?date=YYYY-MM-DD (sticky via
// localStorage) so future puzzles can be tested. Pass ?date= (empty) or
// ?date=clear to clear. No-op in production builds.
function readDateOverride(): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  try {
    const param = new URLSearchParams(window.location.search).get('date')
    if (param !== null) {
      if (param === '' || param === 'clear') {
        localStorage.removeItem(OVERRIDE_KEY)
      } else if (OVERRIDE_RE.test(param)) {
        localStorage.setItem(OVERRIDE_KEY, param)
      }
    }
    const stored = localStorage.getItem(OVERRIDE_KEY)
    if (stored && OVERRIDE_RE.test(stored)) return stored
  } catch {
    /* ignore storage errors */
  }
  return null
}

export function getDateOverride(): string | null {
  return readDateOverride()
}

export function clearDateOverride() {
  if (!import.meta.env.DEV) return
  try {
    localStorage.removeItem(OVERRIDE_KEY)
  } catch {
    /* ignore */
  }
}

export function todayISO(): string {
  const override = readDateOverride()
  if (override) return override
  return format(new Date(), 'yyyy-MM-dd')
}

export function dayNumber(dateISO: string): number {
  const days = differenceInCalendarDays(parseISO(dateISO), parseISO(PROJECT_EPOCH))
  return Math.max(1, days + 1)
}

// The Monday of the week that contains `dateISO`. Used by the weekly Archive
// game so any visit Mon–Sun resolves to the same puzzle.
export function weekStartISO(dateISO: string): string {
  const d = parseISO(dateISO)
  const dow = d.getDay() // 0=Sun … 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow
  return format(addDays(d, offset), 'yyyy-MM-dd')
}

// 1-indexed week number from PROJECT_EPOCH. Both inputs are snapped to their
// week-start, so the same week always returns the same number.
export function weekNumber(dateISO: string): number {
  const startA = parseISO(weekStartISO(PROJECT_EPOCH))
  const startB = parseISO(weekStartISO(dateISO))
  const days = differenceInCalendarDays(startB, startA)
  return Math.max(1, Math.floor(days / 7) + 1)
}

export function msUntilNextLocalMonday(): number {
  const now = new Date()
  const dow = now.getDay() // 0=Sun … 6=Sat
  const daysUntilMon = dow === 1 ? 7 : (8 - dow) % 7 || 7
  const next = startOfDay(addDays(now, daysUntilMon))
  return next.getTime() - now.getTime()
}

export function formatLong(dateISO: string): string {
  return format(parseISO(dateISO), 'MMMM d, yyyy').toUpperCase()
}

export function msUntilNextLocalMidnight(): number {
  const now = new Date()
  const next = startOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  return next.getTime() - now.getTime()
}

export function formatHMS(ms: number): string {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}
