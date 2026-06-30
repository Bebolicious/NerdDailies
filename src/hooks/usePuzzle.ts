import { useEffect, useState } from 'react'
import {
  fetchArchivePuzzle,
  fetchBlurPuzzle,
  fetchConnectionsPuzzle,
  fetchCrosswordPuzzle,
  fetchHigherLowerPuzzle,
  fetchScreenshotPuzzle,
  fetchTrophyPuzzle,
  fetchSoundtrackPuzzle,
} from '../lib/puzzleStore'
import type {
  ArchivePuzzle,
  BlurPuzzle,
  ConnectionsPuzzle,
  CrosswordPuzzle,
  HigherLowerPuzzle,
  ScreenshotPuzzle,
  SoundtrackPuzzle,
  TrophyPuzzle,
} from '../lib/types'

export function useScreenshotPuzzle(date: string) {
  const [puzzle, setPuzzle] = useState<ScreenshotPuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchScreenshotPuzzle(date).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [date])
  return puzzle
}

export function useTrophyPuzzle(date: string) {
  const [puzzle, setPuzzle] = useState<TrophyPuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchTrophyPuzzle(date).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [date])
  return puzzle
}

export function useBlurPuzzle(date: string) {
  const [puzzle, setPuzzle] = useState<BlurPuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchBlurPuzzle(date).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [date])
  return puzzle
}

export function useArchivePuzzle(week: string) {
  const [puzzle, setPuzzle] = useState<ArchivePuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchArchivePuzzle(week).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [week])
  return puzzle
}

export function useCrosswordPuzzle(week: string) {
  const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchCrosswordPuzzle(week).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [week])
  return puzzle
}

export function useHigherLowerPuzzle(week: string) {
  const [puzzle, setPuzzle] = useState<HigherLowerPuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchHigherLowerPuzzle(week).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [week])
  return puzzle
}

export function useConnectionsPuzzle(date: string) {
  const [puzzle, setPuzzle] = useState<ConnectionsPuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchConnectionsPuzzle(date).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [date])
  return puzzle
}

export function useSoundtrackPuzzle(date: string) {
  const [puzzle, setPuzzle] = useState<SoundtrackPuzzle | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchSoundtrackPuzzle(date).then((p) => !cancelled && setPuzzle(p))
    return () => {
      cancelled = true
    }
  }, [date])
  return puzzle
}
