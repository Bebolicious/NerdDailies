import { useEffect, useState } from 'react'
import { NeoCard } from '../components/ui/NeoCard'
import { TagPill } from '../components/ui/TagPill'
import { allResults, currentStreak } from '../lib/scoreStore'
import { todayISO } from '../lib/dates'
import type { PuzzleResult, GameType } from '../lib/types'

export function Stats() {
  const [results, setResults] = useState<PuzzleResult[]>([])
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    setResults(allResults())
    setStreak(currentStreak(todayISO()))
  }, [])

  const byType: Record<GameType, PuzzleResult[]> = {
    screenshot: [],
    trophy: [],
    blur: [],
    soundtrack: [],
    archive: [],
    crossword: [],
    higherlower: [],
  }
  results.forEach((r) => byType[r.gameType].push(r))

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wider mb-1">
        Stats
      </h1>
      <p className="text-sm text-ink-soft mb-6">
        Local-only. Clearing your browser storage wipes them.
      </p>
      <NeoCard tone="lime" shadow="md" className="p-5 mb-5">
        <div className="font-display text-[10px] uppercase tracking-wider font-bold">
          Current streak
        </div>
        <div className="font-display text-5xl font-bold mt-2">{streak}</div>
        <div className="text-xs mt-2">Days with at least one puzzle solved.</div>
      </NeoCard>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(['screenshot', 'trophy', 'blur', 'soundtrack', 'crossword', 'archive', 'higherlower'] as GameType[]).map((t) => {
          const rs = byType[t]
          const solved = rs.filter((r) => r.status === 'solved').length
          // For score-based games (crossword has no guesses, higherlower's
          // guessCount is the score) we show a different sub-line.
          const subline =
            t === 'crossword'
              ? 'solved'
              : t === 'higherlower'
                ? solved > 0
                  ? `avg score ${(
                      rs
                        .filter((r) => r.status === 'solved')
                        .reduce((a, b) => a + b.guessCount, 0) / solved
                    ).toFixed(1)} / 15`
                  : 'completed runs'
                : solved > 0
                  ? `solved · avg ${(
                      rs
                        .filter((r) => r.status === 'solved')
                        .reduce((a, b) => a + b.guessCount, 0) / solved
                    ).toFixed(1)} guesses`
                  : 'solved · avg — guesses'
          const tone =
            t === 'screenshot'
              ? 'coral'
              : t === 'trophy'
                ? 'blue'
                : t === 'blur'
                  ? 'lime'
                  : t === 'soundtrack'
                    ? 'mustard'
                    : t === 'crossword'
                      ? 'paper'
                      : t === 'higherlower'
                        ? 'teal'
                        : 'violet'
          return (
            <NeoCard key={t} tone="paper" shadow="md" className="p-4">
              <TagPill tone={tone}>{t}</TagPill>
              <div className="font-display text-2xl font-bold mt-3">{solved}</div>
              <div className="text-xs text-ink-soft">{subline}</div>
              <div className="text-xs text-ink-soft mt-1">{rs.length} played</div>
            </NeoCard>
          )
        })}
      </div>
    </div>
  )
}
