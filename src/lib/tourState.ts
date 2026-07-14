import type { TourGame } from './tourScore'

// Per-day tour progress, keyed by date. Absent entry ⇒ the player hasn't
// answered today's "want to play The Tour?" prompt yet.

const PREFIX = 'dailies/tour/v1/'

export type TourStatus = 'unanswered' | 'active' | 'declined' | 'completed'

export type TourState = {
  version: 1
  status: Exclude<TourStatus, 'unanswered'>
  // Games whose "continue" step the player has already dismissed — prevents the
  // continue popup re-appearing when revisiting an already-finished game.
  acknowledged: TourGame[]
}

export const TOUR_CHANGED_EVENT = 'dailies:tour-changed'

// Dispatched by the sidebar CTA to explicitly (re)open the tour invite modal,
// bypassing the once-a-day auto-prompt gates. Handled by TourController.
export const TOUR_REQUEST_EVENT = 'dailies:tour-request'

export function loadTour(date: string): TourState | null {
  try {
    const raw = localStorage.getItem(PREFIX + date)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TourState
    if (parsed.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}

export function saveTour(date: string, state: TourState) {
  try {
    localStorage.setItem(PREFIX + date, JSON.stringify(state))
  } catch {
    /* ignore storage errors */
  }
  window.dispatchEvent(new Event(TOUR_CHANGED_EVENT))
}
