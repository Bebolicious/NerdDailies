// Lightweight per-day marker: "the player has made at least one guess in some
// daily game today". Set by every game the moment a guess/skip is submitted —
// before a single-answer game finalizes (which is the only thing scoreStore
// records). The Tour's ask-prompt uses it to avoid nagging someone who's already
// started playing, while still re-appearing on refresh for a fresh day.

const KEY = 'dailies/guessed/v1'

type Map = Record<string, boolean>

function load(): Map {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Map
  } catch {
    return {}
  }
}

export function markGuessedToday(date: string) {
  try {
    const map = load()
    if (map[date]) return
    map[date] = true
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* ignore storage errors */
  }
}

export function hasGuessedToday(date: string): boolean {
  return !!load()[date]
}
