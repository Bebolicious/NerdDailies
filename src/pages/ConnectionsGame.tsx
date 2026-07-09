import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, Share2, Shuffle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { NeoCard } from '../components/ui/NeoCard'
import { NeoButton } from '../components/ui/NeoButton'
import { TagPill } from '../components/ui/TagPill'
import { InfoButton } from '../components/ui/InfoButton'
import { GuestBanner } from '../components/ui/GuestBanner'
import { ScreenEffects } from '../components/ui/ScreenEffects'
import { useConnectionsPuzzle } from '../hooks/usePuzzle'
import { dayNumber, todayISO } from '../lib/dates'
import { cn } from '../lib/cn'
import { saveResult } from '../lib/scoreStore'
import {
  CONNECTIONS_GROUP_SIZE,
  CONNECTIONS_MAX_MISTAKES,
  type ConnectionsDifficulty,
  type ConnectionsPuzzle,
} from '../lib/types'

type Status = 'playing' | 'won' | 'lost'

type Session = {
  version: 1
  solved: number[] // group indices, in the order the player solved them
  selected: string[] // current selection (words)
  mistakes: number
  unlimited: boolean
  // Each guess (right or wrong) recorded as the four selected words' true group
  // difficulty — drives the shareable emoji grid.
  guesses: ConnectionsDifficulty[][]
  guessedKeys: string[] // sorted+joined selections already tried (no re-penalty)
  status: Status
  startedAt: number
  finishedAt: number | null
}

const SESSION_PREFIX = 'dailies/connections-session/v1/'

function emptySession(now: number): Session {
  return {
    version: 1,
    solved: [],
    selected: [],
    mistakes: 0,
    unlimited: false,
    guesses: [],
    guessedKeys: [],
    status: 'playing',
    startedAt: now,
    finishedAt: null,
  }
}

function loadSession(date: string): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + date)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (parsed.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}

function persistSession(date: string, state: Session) {
  try {
    localStorage.setItem(SESSION_PREFIX + date, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

// Difficulty tone → band classes (band bg + text contrast).
const BAND_CLASS: Record<ConnectionsDifficulty, string> = {
  0: 'bg-mustard text-ink-static',
  1: 'bg-lime text-ink-static',
  2: 'bg-blue text-paper-static',
  3: 'bg-coral text-ink-static',
}

export function ConnectionsGame() {
  const today = todayISO()
  const puzzle = useConnectionsPuzzle(today)
  if (!puzzle)
    return <div className="text-sm text-ink-soft">Loading connections…</div>
  return <Board key={puzzle.id} puzzle={puzzle} date={today} />
}

function Board({ puzzle, date }: { puzzle: ConnectionsPuzzle; date: string }) {
  const [state, setState] = useState<Session>(
    () => loadSession(date) ?? emptySession(Date.now()),
  )
  // Ephemeral, per-client display order of the 16 tiles. Starts from the puzzle
  // layout (identical for everyone) and only changes when the player hits
  // Shuffle — a personal convenience, never persisted.
  const [order, setOrder] = useState<string[]>(() => puzzle.layout)
  const [shakeKey, setShakeKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    persistSession(date, state)
  }, [date, state])

  // Auto-dismiss the feedback toast.
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(id)
  }, [toast])

  const finished = state.status !== 'playing'

  // word → its true group index, for membership + "one away" + share colors.
  const wordGroup = useMemo(() => {
    const m = new Map<string, number>()
    puzzle.groups.forEach((g, i) => g.words.forEach((w) => m.set(w, i)))
    return m
  }, [puzzle])

  const solvedWords = useMemo(
    () => new Set(state.solved.flatMap((i) => puzzle.groups[i].words)),
    [state.solved, puzzle],
  )
  const remaining = order.filter((w) => !solvedWords.has(w))

  // Persist the finished result once (sidebar streak + stats).
  const savedRef = useRef(false)
  useEffect(() => {
    if (state.status === 'playing' || savedRef.current) return
    savedRef.current = true
    saveResult({
      date,
      gameType: 'connections',
      status: state.status === 'won' ? 'solved' : 'lost',
      guessCount: state.mistakes,
      guesses: [],
      startedAt: state.startedAt,
      finishedAt: state.finishedAt ?? Date.now(),
    })
    window.dispatchEvent(new Event('dailies:result-saved'))
  }, [state.status, state.mistakes, state.startedAt, state.finishedAt, date])

  const toggleWord = useCallback(
    (w: string) => {
      setState((prev) => {
        if (prev.status !== 'playing') return prev
        if (prev.selected.includes(w))
          return { ...prev, selected: prev.selected.filter((x) => x !== w) }
        if (prev.selected.length >= CONNECTIONS_GROUP_SIZE) return prev
        return { ...prev, selected: [...prev.selected, w] }
      })
    },
    [],
  )

  const onDeselectAll = useCallback(
    () => setState((prev) => ({ ...prev, selected: [] })),
    [],
  )

  const onShuffle = useCallback(
    () => setOrder((prev) => shuffleArray(prev)),
    [],
  )

  const onSubmit = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'playing') return prev
      if (prev.selected.length !== CONNECTIONS_GROUP_SIZE) return prev
      const sel = prev.selected
      const key = [...sel].sort().join('|')
      if (prev.guessedKeys.includes(key)) {
        setToast('Already guessed')
        return prev
      }
      const diffs = sel.map(
        (w) => puzzle.groups[wordGroup.get(w)!].difficulty,
      )
      const matchIdx = puzzle.groups.findIndex((g) => sameSet(g.words, sel))

      if (matchIdx >= 0) {
        const solved = [...prev.solved, matchIdx]
        const won = solved.length === puzzle.groups.length
        return {
          ...prev,
          solved,
          selected: [],
          guesses: [...prev.guesses, diffs],
          guessedKeys: [...prev.guessedKeys, key],
          status: won ? 'won' : 'playing',
          finishedAt: won ? Date.now() : prev.finishedAt,
        }
      }

      // Wrong guess — shake, surface "one away" if exactly 3 share a group.
      setShakeKey((k) => k + 1)
      const oneAway = maxOverlap(puzzle, sel) === CONNECTIONS_GROUP_SIZE - 1
      setToast(oneAway ? 'One away…' : 'Not a group')
      const mistakes = prev.unlimited ? prev.mistakes : prev.mistakes + 1
      const lost =
        !prev.unlimited && mistakes >= CONNECTIONS_MAX_MISTAKES
      return {
        ...prev,
        mistakes,
        guesses: [...prev.guesses, diffs],
        guessedKeys: [...prev.guessedKeys, key],
        status: lost ? 'lost' : 'playing',
        finishedAt: lost ? Date.now() : prev.finishedAt,
      }
    })
  }, [puzzle, wordGroup])

  const onToggleUnlimited = useCallback(
    (next: boolean) =>
      setState((prev) =>
        prev.status === 'playing' ? { ...prev, unlimited: next } : prev,
      ),
    [],
  )

  // Bands to render: player-solved (in solve order); on a loss, reveal the
  // groups that were missed too (sorted easiest → hardest).
  const bandIndices: number[] = useMemo(() => {
    if (state.status === 'lost') {
      const missed = puzzle.groups
        .map((_, i) => i)
        .filter((i) => !state.solved.includes(i))
        .sort((a, b) => puzzle.groups[a].difficulty - puzzle.groups[b].difficulty)
      return [...state.solved, ...missed]
    }
    return state.solved
  }, [state.status, state.solved, puzzle])

  const mistakesLeft = CONNECTIONS_MAX_MISTAKES - state.mistakes
  const submitDisabled =
    finished || state.selected.length !== CONNECTIONS_GROUP_SIZE

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto flex justify-center items-start">
      <ScreenEffects
        type={puzzle.effectType}
        emoji={puzzle.effectEmoji}
        color={puzzle.effectColor}
        active={finished}
      />
      <div className="w-full max-w-3xl px-1 py-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h1 className="font-display text-xl uppercase tracking-wider font-bold flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 stroke-[3]" />
          Connections
          <span className="text-[10px] text-ink-soft font-bold ml-2">
            · Day #{dayNumber(date)}
          </span>
        </h1>
        <div className="flex items-center gap-3">
          {(puzzle.bannerText || puzzle.submitter) && finished && (
            <GuestBanner
              gameType="connections"
              submitter={puzzle.submitter}
              text={puzzle.bannerText}
              color={puzzle.bannerColor}
              variant="inline"
            />
          )}
          <InfoButton
            title="Connections"
            text="Find four groups of four. Tap four words you think share a connection, then Submit. Four mistakes ends the run — or flip on Unlimited to play without a life limit. A new puzzle drops every day."
          />
        </div>
      </div>

      {puzzle.theme && (
        <div className="mb-3 text-xs uppercase tracking-[0.2em] text-ink-soft font-display">
          ▸ {puzzle.theme}
        </div>
      )}

      <NeoCard tone="paper" shadow="md" className="p-4 sm:p-5 relative">

        {/* Solved / revealed group bands */}
        {bandIndices.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {bandIndices.map((gi) => {
              const g = puzzle.groups[gi]
              const missed = !state.solved.includes(gi)
              return (
                <div
                  key={gi}
                  className={cn(
                    'border-neo-2 px-4 py-2.5 text-center animate-connections-solve',
                    BAND_CLASS[g.difficulty],
                    missed && 'opacity-90',
                  )}
                >
                  <div className="font-display text-sm uppercase tracking-wider font-bold flex items-center justify-center gap-2">
                    {g.category}
                    {missed && (
                      <span className="text-[9px] border-[2px] border-stroke px-1 py-0.5 leading-none">
                        missed
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider font-bold mt-1 opacity-90">
                    {g.words.join(' · ')}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Remaining word grid (only while playing) */}
        {!finished && (
          <div
            key={shakeKey}
            className={cn(
              'grid grid-cols-4 gap-2',
              toast === 'One away…' || toast === 'Not a group'
                ? 'animate-connections-shake'
                : undefined,
            )}
          >
            {remaining.map((w) => {
              const selected = state.selected.includes(w)
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => toggleWord(w)}
                  aria-pressed={selected}
                  className={cn(
                    'border-neo-2 h-[64px] sm:h-[80px] px-1 flex items-center justify-center text-center',
                    'font-display text-[11px] sm:text-sm uppercase tracking-wide font-bold leading-tight break-words',
                    'transition-all hover:-translate-y-[1px]',
                    selected
                      ? 'bg-blue/25 border-blue text-ink'
                      : 'bg-cream-soft hover:bg-paper',
                  )}
                >
                  {w}
                </button>
              )
            })}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="mt-3 flex justify-center">
            <span className="border-neo-2 bg-emphasis text-paper-static px-3 py-1.5 font-display text-xs uppercase tracking-wider font-bold">
              {toast}
            </span>
          </div>
        )}

        {/* Mistakes + controls (only while playing) */}
        {!finished && (
          <>
            <div className="mt-4 flex items-center justify-center gap-2 min-h-[28px]">
              {state.unlimited ? (
                <TagPill tone="orange">Unlimited mode</TagPill>
              ) : (
                <>
                  <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft mr-1">
                    Mistakes left
                  </span>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: CONNECTIONS_MAX_MISTAKES }).map(
                      (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'w-3.5 h-3.5 rounded-full border-[2px] border-stroke',
                            i < mistakesLeft ? 'bg-emphasis' : 'bg-transparent',
                          )}
                          aria-hidden
                        />
                      ),
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <NeoButton
                tone="paper"
                size="sm"
                onClick={onShuffle}
                aria-label="Shuffle remaining words"
              >
                <Shuffle className="inline h-3 w-3 mr-1" /> Shuffle
              </NeoButton>
              <NeoButton
                tone="paper"
                size="sm"
                onClick={onDeselectAll}
                disabled={state.selected.length === 0}
              >
                Deselect all
              </NeoButton>
              <NeoButton
                tone="orange"
                size="sm"
                onClick={onSubmit}
                disabled={submitDisabled}
              >
                Submit
              </NeoButton>
            </div>

            <label className="mt-4 flex items-center justify-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={state.unlimited}
                onChange={(e) => onToggleUnlimited(e.target.checked)}
                className="appearance-none rounded-none w-4 h-4 border-neo bg-paper checked:bg-orange cursor-pointer shrink-0"
              />
              <span className="font-display text-[11px] uppercase tracking-wider font-bold">
                Unlimited guesses
              </span>
            </label>
          </>
        )}

        {finished && (
          <Finale
            status={state.status}
            date={date}
            guesses={state.guesses}
            mistakes={state.mistakes}
            unlimited={state.unlimited}
          />
        )}
      </NeoCard>
      </div>
    </div>
  )
}

function Finale({
  status,
  date,
  guesses,
  mistakes,
  unlimited,
}: {
  status: Status
  date: string
  guesses: ConnectionsDifficulty[][]
  mistakes: number
  unlimited: boolean
}) {
  const [copied, setCopied] = useState(false)
  const share = useMemo(
    () => buildShare(date, status, guesses),
    [date, status, guesses],
  )
  return (
    <div className="mt-5 flex flex-col gap-4">
      <NeoCard tone={status === 'won' ? 'lime' : 'coral'} shadow="md" className="p-5">
        <div className="font-display text-[10px] uppercase tracking-wider font-bold">
          {status === 'won' ? 'Solved' : 'Out of guesses'}
        </div>
        <div className="font-display text-3xl font-bold mt-1 leading-none">
          {status === 'won' ? 'All four groups!' : 'Better luck tomorrow'}
        </div>
        <div className="text-[11px] uppercase tracking-wider font-display mt-3 opacity-90">
          {unlimited
            ? 'Unlimited mode'
            : `${mistakes} mistake${mistakes === 1 ? '' : 's'} used`}
        </div>
      </NeoCard>

      <pre className="bg-paper border-neo-2 text-ink p-3 text-base leading-snug font-display whitespace-pre self-start">
        {share}
      </pre>

      <div className="flex flex-wrap items-center gap-3">
        <NeoButton
          tone="mustard"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(share).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          <Share2 className="inline h-3 w-3 mr-1" />{' '}
          {copied ? 'Copied!' : 'Copy share'}
        </NeoButton>
        <Link
          to="/screenshot"
          className="font-display text-xs uppercase tracking-wider font-bold underline"
        >
          Back to dailies →
        </Link>
      </div>
    </div>
  )
}

// ─── helpers ───────────────────────────────────────────────────────────────

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every((x) => sb.has(x))
}

// Largest count of selected words that fall in a single group — 3 means the
// player is "one away".
function maxOverlap(puzzle: ConnectionsPuzzle, sel: string[]): number {
  let best = 0
  for (const g of puzzle.groups) {
    const gs = new Set(g.words)
    const n = sel.filter((w) => gs.has(w)).length
    if (n > best) best = n
  }
  return best
}

function shuffleArray<T>(input: T[]): T[] {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function buildShare(
  date: string,
  status: Status,
  guesses: ConnectionsDifficulty[][],
): string {
  const d = dayNumber(date)
  const n = guesses.length
  const tries = `${n} guess${n === 1 ? '' : 'es'}`
  return status === 'won'
    ? `Connections · Day ${d}\nSolved in ${tries}`
    : `Connections · Day ${d}\nDidn't solve it · ${tries}`
}
