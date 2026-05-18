import type { GameType, PuzzleResult } from './types'

const KEY = 'dailies/results/v1'

type ResultMap = Record<string, PuzzleResult>

function load(): ResultMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ResultMap
  } catch {
    return {}
  }
}

function save(map: ResultMap) {
  localStorage.setItem(KEY, JSON.stringify(map))
}

function keyFor(date: string, gameType: GameType) {
  return `${date}:${gameType}`
}

export function getResult(
  date: string,
  gameType: GameType,
): PuzzleResult | undefined {
  return load()[keyFor(date, gameType)]
}

export function saveResult(result: PuzzleResult) {
  const map = load()
  map[keyFor(result.date, result.gameType)] = result
  save(map)
}

export function allResults(): PuzzleResult[] {
  return Object.values(load())
}

// Current streak: consecutive days (including today if solved) with at least
// one game solved.
export function currentStreak(todayISO: string): number {
  const results = allResults()
  const solvedDays = new Set(
    results.filter((r) => r.status === 'solved').map((r) => r.date),
  )
  let streak = 0
  let cursor = new Date(todayISO)
  // Drop today if nothing solved yet — streak still valid from yesterday.
  if (!solvedDays.has(toISO(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (solvedDays.has(toISO(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}
