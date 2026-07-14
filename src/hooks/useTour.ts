import { useCallback, useEffect, useState } from 'react'
import {
  loadTour,
  saveTour,
  TOUR_CHANGED_EVENT,
  type TourState,
  type TourStatus,
} from '../lib/tourState'
import type { TourGame } from '../lib/tourScore'

// Day-scoped tour progress. Syncs across the tree (and tabs) via the
// TOUR_CHANGED_EVENT / storage events so the controller, settings and any game
// page observe the same state.
export function useTour(date: string) {
  const [state, setState] = useState<TourState | null>(() => loadTour(date))

  // Re-read when the day rolls over (render-phase reset — no effect needed).
  const [prevDate, setPrevDate] = useState(date)
  if (prevDate !== date) {
    setPrevDate(date)
    setState(loadTour(date))
  }

  useEffect(() => {
    const sync = () => setState(loadTour(date))
    window.addEventListener(TOUR_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(TOUR_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [date])

  const write = useCallback(
    (next: TourState) => {
      saveTour(date, next)
      setState(next)
    },
    [date],
  )

  const status: TourStatus = state?.status ?? 'unanswered'
  const acknowledged = state?.acknowledged ?? []

  const accept = useCallback(
    () => write({ version: 1, status: 'active', acknowledged: [] }),
    [write],
  )

  const acknowledge = useCallback(
    (game: TourGame) =>
      write({
        version: 1,
        status: state?.status === 'completed' ? 'completed' : 'active',
        acknowledged: Array.from(new Set([...(state?.acknowledged ?? []), game])),
      }),
    [state, write],
  )

  const complete = useCallback(
    () =>
      write({
        version: 1,
        status: 'completed',
        acknowledged: Array.from(
          new Set([...(state?.acknowledged ?? []), 'connections' as TourGame]),
        ),
      }),
    [state, write],
  )

  return {
    status,
    acknowledged,
    isActive: status === 'active',
    accept,
    acknowledge,
    complete,
  }
}
