import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  BookOpen,
  Flame,
  KeyRound,
  Lock,
  Music,
  Radio,
  Scroll,
  Search,
  Share2,
  Trash2,
} from 'lucide-react'
import { GameSearch } from '../components/game/GameSearch'
import { NeoCard } from '../components/ui/NeoCard'
import { NeoButton } from '../components/ui/NeoButton'
import { InfoButton } from '../components/ui/InfoButton'
import { useArchivePuzzle } from '../hooks/usePuzzle'
import { todayISO, weekNumber, weekStartISO } from '../lib/dates'
import { cn } from '../lib/cn'
import { saveResult } from '../lib/scoreStore'
import {
  ARCHIVE_COSTS,
  ARCHIVE_FRAME_BLUR_PX,
  ARCHIVE_MAX_WRONG,
  ARCHIVE_TOTAL_CANDLES,
  type ArchiveMysteryBox,
  type ArchivePuzzle,
  type IgdbGame,
} from '../lib/types'

// ─── persisted in-progress state ────────────────────────────────────────────

type WrongStamp = { name: string; at: number }

type StandardBoxId =
  | 'shelfA'
  | 'shelfB'
  | 'shelfC'
  | 'drawerTop'
  | 'drawerMid'
  | 'drawerBot'

const STANDARD_BOX_IDS: StandardBoxId[] = [
  'shelfA',
  'shelfB',
  'shelfC',
  'drawerTop',
  'drawerMid',
  'drawerBot',
]

type ArchiveSession = {
  version: 1
  candles: number
  wrongs: WrongStamp[]
  solvedWith: string | null
  status: 'playing' | 'solved' | 'lost'
  opened: Record<StandardBoxId, boolean>
  locked: Record<StandardBoxId, boolean>
  radio: boolean
  frames: [boolean, boolean]
  mysteryAFound: boolean
  mysteryAOpened: boolean
  mysteryBFound: boolean
  mysteryBOpened: boolean
  chestOpened: boolean
  trashRummaged: boolean
  trashOutcome: 'crossed' | 'mysteryB' | 'nothing' | null
  spareCandleClaimed: boolean
  jackpotUntil: number | null
  startedAt: number
  finishedAt: number | null
  stampToast: number | null
}

function emptySession(now: number): ArchiveSession {
  return {
    version: 1,
    candles: ARCHIVE_TOTAL_CANDLES,
    wrongs: [],
    solvedWith: null,
    status: 'playing',
    opened: {
      shelfA: false,
      shelfB: false,
      shelfC: false,
      drawerTop: false,
      drawerMid: false,
      drawerBot: false,
    },
    locked: {
      shelfA: false,
      shelfB: false,
      shelfC: false,
      drawerTop: false,
      drawerMid: false,
      drawerBot: false,
    },
    radio: false,
    frames: [false, false],
    mysteryAFound: false,
    mysteryAOpened: false,
    mysteryBFound: false,
    mysteryBOpened: false,
    chestOpened: false,
    trashRummaged: false,
    trashOutcome: null,
    spareCandleClaimed: false,
    jackpotUntil: null,
    startedAt: now,
    finishedAt: null,
    stampToast: null,
  }
}

const SESSION_PREFIX = 'dailies/archive-session/v1/'

function loadSession(week: string): ArchiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + week)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ArchiveSession
    if (parsed.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}

function persistSession(week: string, state: ArchiveSession) {
  try {
    localStorage.setItem(SESSION_PREFIX + week, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

// Deterministic 0..1 hash from a string, used for trash outcome & jitter so
// the room looks the same shape every time the same week is played.
function seedHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

// ─── page ───────────────────────────────────────────────────────────────────

export function ArchiveGame() {
  const today = todayISO()
  const week = weekStartISO(today)
  const puzzle = useArchivePuzzle(week)
  if (!puzzle)
    return <div className="text-sm text-ink-soft">Loading archive…</div>
  return <ArchiveRoom key={puzzle.id} puzzle={puzzle} week={week} />
}

function ArchiveRoom({
  puzzle,
  week,
}: {
  puzzle: ArchivePuzzle
  week: string
}) {
  const [state, setState] = useState<ArchiveSession>(
    () => loadSession(week) ?? emptySession(Date.now()),
  )

  useEffect(() => {
    persistSession(week, state)
  }, [week, state])

  // jackpot timer — auto-clear when expired
  useEffect(() => {
    if (!state.jackpotUntil) return
    const ms = Math.max(0, state.jackpotUntil - Date.now())
    const t = window.setTimeout(
      () => setState((s) => ({ ...s, jackpotUntil: null })),
      ms,
    )
    return () => window.clearTimeout(t)
  }, [state.jackpotUntil])

  // dismiss the "WRONG CASE FILE" toast after a beat
  useEffect(() => {
    if (!state.stampToast) return
    const t = window.setTimeout(
      () => setState((s) => ({ ...s, stampToast: null })),
      1600,
    )
    return () => window.clearTimeout(t)
  }, [state.stampToast])

  const wrongCount = state.wrongs.length
  const finished = state.status !== 'playing'

  const spend = useCallback(
    (cost: number, updater: (prev: ArchiveSession) => ArchiveSession) => {
      setState((prev) => {
        if (prev.status !== 'playing') return prev
        if (prev.candles < cost) return prev
        const next = updater(prev)
        return { ...next, candles: next.candles - cost }
      })
    },
    [],
  )

  const onGuess = useCallback(
    (g: IgdbGame) => {
      setState((prev) => {
        if (prev.status !== 'playing') return prev
        if (g.id === puzzle.game.id) {
          const finished: ArchiveSession = {
            ...prev,
            status: 'solved',
            solvedWith: g.name,
            finishedAt: Date.now(),
            jackpotUntil: null,
          }
          // mirror to global score store so streak/stats pick it up
          saveResult({
            date: week,
            gameType: 'archive',
            status: 'solved',
            guessCount: prev.wrongs.length + 1,
            guesses: [
              ...prev.wrongs.map((w) => ({
                kind: 'wrong' as const,
                game: { id: -1, name: w.name },
                at: w.at,
              })),
              { kind: 'correct', game: g, at: Date.now() },
            ],
            startedAt: prev.startedAt,
            finishedAt: finished.finishedAt!,
          })
          window.dispatchEvent(new Event('dailies:result-saved'))
          return finished
        }
        // wrong — lock a random unlocked standard box, bump wall blur, stamp
        const candidates = STANDARD_BOX_IDS.filter(
          (id) => !prev.locked[id] && !prev.opened[id],
        )
        const pick =
          candidates.length > 0
            ? candidates[
                Math.floor(
                  seedHash(week + g.name + prev.wrongs.length) *
                    candidates.length,
                )
              ]
            : null
        const wrongs = [...prev.wrongs, { name: g.name, at: Date.now() }]
        const status: ArchiveSession['status'] =
          wrongs.length >= ARCHIVE_MAX_WRONG ? 'lost' : 'playing'
        const result: ArchiveSession = {
          ...prev,
          wrongs,
          locked: pick ? { ...prev.locked, [pick]: true } : prev.locked,
          status,
          finishedAt: status === 'lost' ? Date.now() : prev.finishedAt,
          stampToast: Date.now(),
        }
        if (status === 'lost') {
          saveResult({
            date: week,
            gameType: 'archive',
            status: 'lost',
            guessCount: wrongs.length,
            guesses: wrongs.map((w) => ({
              kind: 'wrong' as const,
              game: { id: -1, name: w.name },
              at: w.at,
            })),
            startedAt: prev.startedAt,
            finishedAt: result.finishedAt!,
          })
          window.dispatchEvent(new Event('dailies:result-saved'))
        }
        return result
      })
    },
    [puzzle.game.id, week],
  )

  // Trash outcome is deterministic — same week always rummages the same.
  const trashOutcome: 'crossed' | 'mysteryB' | 'nothing' = useMemo(() => {
    const r = seedHash(week + 'trash')
    if (r < 0.4) return 'crossed'
    if (r < 0.7) return 'mysteryB'
    return 'nothing'
  }, [week])

  const rummageTrash = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'playing' || prev.trashRummaged) return prev
      const next: ArchiveSession = {
        ...prev,
        trashRummaged: true,
        trashOutcome,
      }
      if (trashOutcome === 'mysteryB') next.mysteryBFound = true
      return next
    })
  }, [trashOutcome])

  const frameBlurPx =
    ARCHIVE_FRAME_BLUR_PX[Math.min(wrongCount, ARCHIVE_FRAME_BLUR_PX.length - 1)]

  // Always derive: clue cards for opened items (rendered in the desk pane).
  const openedClues = useMemo(
    () => buildOpenedClues(state, puzzle, trashOutcome),
    [state, puzzle, trashOutcome],
  )

  const rank = useMemo(
    () => (state.status === 'solved' ? computeRank(state) : null),
    [state],
  )

  const shareString = useMemo(
    () => (finished ? buildShareString(state, puzzle, week) : null),
    [finished, state, puzzle, week],
  )

  return (
    <div className="max-w-5xl archive-readable">
      <ArchiveStyles />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h1 className="font-display text-xl uppercase tracking-wider font-bold flex items-center gap-2">
          <Archive className="h-5 w-5 stroke-[3]" />
          The Archive
          <span className="text-[10px] text-ink-soft font-bold ml-2">
            · Week #{weekNumber(week)}
          </span>
        </h1>
        <InfoButton
          title="The Archive"
          text="Weekly puzzle. You have 5 candles. Spend them on objects in the room — boxes, drawers, the radio, framed photos. Each clue costs 1 candle, the sealed chest costs 2. Identify the game in 3 wrong guesses or fewer. Each wrong guess locks a clue and sharpens the walls."
        />
      </div>

      {puzzle.weekly_theme && (
        <div className="mb-3 text-xs uppercase tracking-[0.2em] text-ink-soft font-display">
          ▸ {puzzle.weekly_theme}
        </div>
      )}

      {/* Room — dark noir surface */}
      <div className="archive-room border-neo shadow-neo-lg relative overflow-hidden">
        <DustLayer />

        {/* Header band — candles, stamps */}
        <div className="relative z-10 px-5 py-4 flex items-center justify-between gap-4 border-b-[3px] border-stroke bg-paper">
          <CandleCounter candles={state.candles} />
          <WrongStamps wrongs={state.wrongs} max={ARCHIVE_MAX_WRONG} />
        </div>

        {/* Wall — frames + chest */}
        <div className="relative z-10 px-5 pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <WallFrame
            title="Frame · Gameplay"
            imageUrl={puzzle.frame1_url}
            blurPx={frameBlurPx}
            opened={state.frames[0]}
            disabled={finished || state.candles < ARCHIVE_COSTS.frame}
            onOpen={() =>
              spend(ARCHIVE_COSTS.frame, (p) => ({
                ...p,
                frames: [true, p.frames[1]],
              }))
            }
            cost={ARCHIVE_COSTS.frame}
          />
          <WallFrame
            title="Frame · Key Art"
            imageUrl={puzzle.frame2_url}
            blurPx={frameBlurPx}
            opened={state.frames[1]}
            disabled={finished || state.candles < ARCHIVE_COSTS.frame}
            onOpen={() =>
              spend(ARCHIVE_COSTS.frame, (p) => ({
                ...p,
                frames: [p.frames[0], true],
              }))
            }
            cost={ARCHIVE_COSTS.frame}
          />
          <ChestPanel
            opened={state.chestOpened}
            disabled={finished || state.candles < ARCHIVE_COSTS.chest}
            onOpen={() =>
              spend(ARCHIVE_COSTS.chest, (p) => ({
                ...p,
                chestOpened: true,
              }))
            }
            chestLogoUrl={puzzle.chest_logo_url}
            jackpotUntil={state.jackpotUntil}
          />
        </div>

        {/* Furniture row — shelf | cabinet | radio */}
        <div className="relative z-10 px-5 pt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Shelf
            opened={[state.opened.shelfA, state.opened.shelfB, state.opened.shelfC]}
            locked={[state.locked.shelfA, state.locked.shelfB, state.locked.shelfC]}
            disabled={finished || state.candles < ARCHIVE_COSTS.shelfBox}
            onOpen={(idx) =>
              spend(ARCHIVE_COSTS.shelfBox, (p) => ({
                ...p,
                opened: {
                  ...p.opened,
                  [idx === 0 ? 'shelfA' : idx === 1 ? 'shelfB' : 'shelfC']: true,
                },
              }))
            }
            cost={ARCHIVE_COSTS.shelfBox}
            mysteryAFound={state.mysteryAFound}
            onDiscoverMysteryA={() =>
              setState((p) =>
                p.status !== 'playing' ? p : { ...p, mysteryAFound: true },
              )
            }
          />
          <FilingCabinet
            opened={[
              state.opened.drawerTop,
              state.opened.drawerMid,
              state.opened.drawerBot,
            ]}
            locked={[
              state.locked.drawerTop,
              state.locked.drawerMid,
              state.locked.drawerBot,
            ]}
            disabled={finished || state.candles < ARCHIVE_COSTS.cabinetDrawer}
            onOpen={(idx) =>
              spend(ARCHIVE_COSTS.cabinetDrawer, (p) => ({
                ...p,
                opened: {
                  ...p.opened,
                  [idx === 0
                    ? 'drawerTop'
                    : idx === 1
                      ? 'drawerMid'
                      : 'drawerBot']: true,
                },
              }))
            }
            cost={ARCHIVE_COSTS.cabinetDrawer}
            spareCandleClaimed={state.spareCandleClaimed}
            spareCandleVisible={state.candles < 4}
            spareCandleDisabled={finished}
            onClaimSpareCandle={() =>
              setState((p) =>
                p.status !== 'playing' || p.spareCandleClaimed
                  ? p
                  : {
                      ...p,
                      spareCandleClaimed: true,
                      candles: Math.min(
                        ARCHIVE_TOTAL_CANDLES,
                        p.candles + 1,
                      ),
                    },
              )
            }
          />
          <RadioPanel
            opened={state.radio}
            disabled={finished || state.candles < ARCHIVE_COSTS.radio}
            audioUrl={puzzle.audio_url}
            onOpen={() =>
              spend(ARCHIVE_COSTS.radio, (p) => ({ ...p, radio: true }))
            }
            cost={ARCHIVE_COSTS.radio}
          />
        </div>

        {/* Bottom row — trash + mystery boxes */}
        <div className="relative z-10 px-5 pt-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TrashCan
            rummaged={state.trashRummaged}
            outcome={state.trashOutcome}
            disabled={finished}
            onRummage={rummageTrash}
            crossedOut={puzzle.trash_crossed_out}
          />
          <MysteryBoxPanel
            label="Mystery box · behind shelf"
            found={state.mysteryAFound}
            opened={state.mysteryAOpened}
            box={puzzle.mystery_a}
            disabled={finished || state.candles < ARCHIVE_COSTS.mysteryBox}
            cost={ARCHIVE_COSTS.mysteryBox}
            onOpen={() =>
              spend(ARCHIVE_COSTS.mysteryBox, (p) => ({
                ...p,
                mysteryAOpened: true,
                jackpotUntil:
                  puzzle.mystery_a.type === 'jackpot'
                    ? Date.now() + 3000
                    : p.jackpotUntil,
              }))
            }
          />
          <MysteryBoxPanel
            label="Mystery box · trash"
            found={state.mysteryBFound}
            opened={state.mysteryBOpened}
            box={puzzle.mystery_b}
            disabled={finished || state.candles < ARCHIVE_COSTS.mysteryBox}
            cost={ARCHIVE_COSTS.mysteryBox}
            onOpen={() =>
              spend(ARCHIVE_COSTS.mysteryBox, (p) => ({
                ...p,
                mysteryBOpened: true,
                jackpotUntil:
                  puzzle.mystery_b.type === 'jackpot'
                    ? Date.now() + 3000
                    : p.jackpotUntil,
              }))
            }
          />
        </div>

        {/* WRONG stamp toast */}
        {state.stampToast && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
            aria-hidden
          >
            <div className="archive-stamp font-display text-4xl md:text-6xl uppercase tracking-widest font-bold">
              ✗ Wrong Case File
            </div>
          </div>
        )}

        {/* Jackpot full-cover flash */}
        {state.jackpotUntil && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 bg-black/80 backdrop-blur-sm">
            <div className="border-neo shadow-neo-lg p-3 bg-paper">
              <img
                src={puzzle.frame2_url}
                alt=""
                className="w-72 max-w-[60vw] aspect-[4/5] object-cover"
              />
              <div className="font-display text-xs uppercase tracking-wider font-bold mt-2 text-center">
                ★ Jackpot · full art
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desk — input + opened clues + (after end) reveal */}
      <NeoCard tone="paper" shadow="md" className="mt-5 p-5">
        <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
          <Search className="h-3 w-3 stroke-[3]" /> Desk · case file
        </div>
        {!finished && (
          <CaseDossier
            wrongs={state.wrongs}
            maxWrong={ARCHIVE_MAX_WRONG}
            weeklyTheme={puzzle.weekly_theme}
          />
        )}
        <div className="mt-3">
          {!finished ? (
            <GameSearch placeholder="Name the game…" onGuess={onGuess} />
          ) : (
            <FinaleCard
              status={state.status}
              answer={puzzle.game}
              rank={rank}
              shareString={shareString}
              wrongCount={wrongCount}
              candlesLeft={state.candles}
              clues={openedClues}
            />
          )}
        </div>
        {!finished && openedClues.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {openedClues.map((c, i) => (
              <ClueCard key={i} clue={c} />
            ))}
          </div>
        )}
        <div className="mt-4 text-[10px] uppercase tracking-wider text-ink-soft font-display">
          Wrong guesses · {wrongCount} / {ARCHIVE_MAX_WRONG} · Candles · {state.candles} /{' '}
          {ARCHIVE_TOTAL_CANDLES}
        </div>
      </NeoCard>
    </div>
  )
}

// ─── small composable bits ───────────────────────────────────────────────────

function CandleCounter({ candles }: { candles: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: ARCHIVE_TOTAL_CANDLES }).map((_, i) => {
        const lit = i < candles
        return (
          <div
            key={i}
            className={cn(
              'archive-candle relative w-5 h-7 flex items-end justify-center',
              !lit && 'opacity-30 grayscale',
            )}
            aria-label={lit ? 'lit candle' : 'spent candle'}
          >
            <div className="w-3 h-5 bg-paper-static border-[2px] border-stroke" />
            <div
              className="archive-flame absolute -top-1 w-3 h-3"
              style={{ animationDelay: `${i * 0.13}s` }}
            />
          </div>
        )
      })}
      <span className="ml-2 font-display text-[10px] uppercase tracking-wider text-ink">
        {candles} / {ARCHIVE_TOTAL_CANDLES}
      </span>
    </div>
  )
}

function WrongStamps({ wrongs, max }: { wrongs: WrongStamp[]; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-display text-[10px] uppercase tracking-wider text-ink">
        Wrong
      </span>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-6 h-6 border-[2px] border-stroke flex items-center justify-center font-display text-sm font-bold',
            wrongs[i] ? 'bg-coral text-ink-static' : 'bg-cream-soft text-ink-soft',
          )}
        >
          {wrongs[i] ? '✗' : ''}
        </div>
      ))}
    </div>
  )
}

function ArchiveObject({
  title,
  icon,
  hint,
  cost,
  opened,
  locked,
  disabled,
  onOpen,
  children,
  toneOpen = 'bg-cream-soft',
  glow = true,
}: {
  title: string
  icon: React.ReactNode
  hint?: string
  cost?: number
  opened: boolean
  locked?: boolean
  disabled?: boolean
  onOpen: () => void
  children?: React.ReactNode
  toneOpen?: string
  glow?: boolean
}) {
  if (locked) {
    return (
      <div className="archive-tile archive-locked p-3 flex flex-col items-center justify-center gap-1 min-h-[88px] text-ink-soft">
        <Lock className="h-5 w-5 stroke-[2.5]" />
        <div className="font-display text-[10px] uppercase tracking-wider font-bold">
          Locked
        </div>
        <div className="text-[10px] font-display uppercase opacity-60">{title}</div>
      </div>
    )
  }
  if (opened) {
    return (
      <div className={cn('archive-tile-open p-3', toneOpen)}>
        <div className="flex items-center gap-2 mb-2 text-ink">
          {icon}
          <div className="font-display text-[10px] uppercase tracking-wider font-bold">
            {title}
          </div>
        </div>
        {children}
      </div>
    )
  }
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      className={cn(
        'archive-tile archive-tile-closed p-3 flex flex-col items-center justify-center gap-1 min-h-[88px] text-ink disabled:cursor-not-allowed disabled:opacity-50',
        glow && !disabled && 'archive-glow',
      )}
    >
      {icon}
      <div className="font-display text-[10px] uppercase tracking-wider font-bold text-center">
        {title}
      </div>
      {hint && (
        <div className="text-[10px] font-display uppercase opacity-60">
          {hint}
        </div>
      )}
      {cost !== undefined && (
        <div className="text-[10px] font-display uppercase opacity-80 flex items-center gap-1">
          <Flame className="h-3 w-3" /> {cost}
        </div>
      )}
    </button>
  )
}

function Shelf({
  opened,
  locked,
  disabled,
  onOpen,
  cost,
  mysteryAFound,
  onDiscoverMysteryA,
}: {
  opened: boolean[]
  locked: boolean[]
  disabled?: boolean
  onOpen: (idx: number) => void
  cost: number
  mysteryAFound: boolean
  onDiscoverMysteryA: () => void
}) {
  return (
    <div className="border-[3px] border-stroke bg-paper p-3 relative">
      <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mb-3 flex items-center gap-2">
        <BookOpen className="h-3 w-3 stroke-[3]" /> Bookshelf
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['A', 'B', 'C'] as const).map((label, i) => (
          <ArchiveObject
            key={i}
            title={`Box ${label}`}
            icon={<span className="text-2xl leading-none">📦</span>}
            hint={i === 0 ? 'Year' : i === 1 ? 'Genre' : 'Platform'}
            cost={cost}
            opened={opened[i]}
            locked={locked[i]}
            disabled={disabled}
            onOpen={() => onOpen(i)}
          >
            <div className="text-ink text-sm leading-snug">
              {/* the actual clue text is rendered in the desk panel; show a
                  small "opened" marker here to keep the room tidy. */}
              <span className="font-display text-[10px] uppercase tracking-wider opacity-70">
                Filed → see desk
              </span>
            </div>
          </ArchiveObject>
        ))}
      </div>
      {/* Hidden mystery box A: a faint glint at the corner of the shelf. */}
      {!mysteryAFound && (
        <button
          onClick={onDiscoverMysteryA}
          className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-mustard animate-pulse opacity-70 border-[2px] border-stroke"
          aria-label="Something glints behind the shelf"
          title="Something glints behind the shelf…"
        />
      )}
    </div>
  )
}

function FilingCabinet({
  opened,
  locked,
  disabled,
  onOpen,
  cost,
  spareCandleClaimed,
  spareCandleVisible,
  spareCandleDisabled,
  onClaimSpareCandle,
}: {
  opened: boolean[]
  locked: boolean[]
  disabled?: boolean
  onOpen: (idx: number) => void
  cost: number
  spareCandleClaimed: boolean
  spareCandleVisible: boolean
  spareCandleDisabled?: boolean
  onClaimSpareCandle: () => void
}) {
  return (
    <div className="border-[3px] border-stroke bg-paper p-3 relative">
      <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mb-3 flex items-center gap-2">
        <Scroll className="h-3 w-3 stroke-[3]" /> Filing Cabinet
      </div>
      <div className="flex flex-col gap-2">
        {(['Top', 'Middle', 'Bottom'] as const).map((label, i) => (
          <ArchiveObject
            key={i}
            title={`${label} drawer`}
            icon={<span className="text-xl leading-none">🗄️</span>}
            hint={i === 0 ? 'Pitch' : i === 1 ? 'Memo' : 'Review'}
            cost={cost}
            opened={opened[i]}
            locked={locked[i]}
            disabled={disabled}
            onOpen={() => onOpen(i)}
          >
            <div className="font-display text-[10px] uppercase tracking-wider opacity-70 text-ink">
              Filed → see desk
            </div>
          </ArchiveObject>
        ))}
      </div>
      {/* Hidden spare candle: a faint flicker wedged behind the cabinet.
          One-time pickup, +1 candle (capped at total). Only surfaces when
          the player is genuinely low (< 4 candles) so it stays a rescue,
          not a flat freebie. */}
      {!spareCandleClaimed && spareCandleVisible && (
        <button
          onClick={onClaimSpareCandle}
          disabled={spareCandleDisabled}
          className="archive-spare-glint absolute -bottom-2 -left-2 w-6 h-7 flex items-end justify-center disabled:!opacity-0"
          aria-label="A candle stub flickers behind the cabinet"
          title="A candle stub flickers behind the cabinet…"
        >
          <div className="w-3 h-5 bg-paper-static border-[2px] border-stroke" />
          <div
            className="archive-flame absolute -top-0.5 w-3 h-3"
            style={{ animationDelay: '0.4s' }}
          />
        </button>
      )}
    </div>
  )
}

function RadioPanel({
  opened,
  disabled,
  onOpen,
  audioUrl,
  cost,
}: {
  opened: boolean
  disabled?: boolean
  onOpen: () => void
  audioUrl?: string
  cost: number
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.7)
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])
  return (
    <div className="border-[3px] border-stroke bg-paper p-3">
      <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mb-3 flex items-center gap-2">
        <Radio className="h-3 w-3 stroke-[3]" /> Radio · OST
      </div>
      {opened ? (
        <div className="bg-cream-soft border-[2px] border-stroke p-3 flex flex-col items-center gap-2">
          <Waveform playing={playing} />
          {audioUrl ? (
            <>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
              <div className="flex items-center gap-2">
                <NeoButton
                  tone="mustard"
                  size="sm"
                  onClick={() => {
                    const a = audioRef.current
                    if (!a) return
                    if (playing) a.pause()
                    else a.play()
                  }}
                >
                  <Music className="inline h-3 w-3 mr-1" />
                  {playing ? 'Pause' : 'Play'}
                </NeoButton>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volume"
                  title={`Volume · ${Math.round(volume * 100)}%`}
                  className="archive-volume w-16 h-1 cursor-pointer"
                />
              </div>
            </>
          ) : (
            <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
              No reel filed this week.
            </div>
          )}
        </div>
      ) : (
        <ArchiveObject
          title="Spin the dial"
          icon={<span className="text-2xl leading-none">📻</span>}
          cost={cost}
          opened={false}
          disabled={disabled}
          onOpen={onOpen}
        />
      )}
    </div>
  )
}

function WallFrame({
  title,
  imageUrl,
  blurPx,
  opened,
  disabled,
  onOpen,
  cost,
}: {
  title: string
  imageUrl: string
  blurPx: number
  opened: boolean
  disabled?: boolean
  onOpen: () => void
  cost: number
}) {
  if (!opened) {
    return (
      <ArchiveObject
        title={title}
        icon={<span className="text-2xl leading-none">🖼️</span>}
        cost={cost}
        opened={false}
        disabled={disabled}
        onOpen={onOpen}
        hint="Sharpens with each wrong guess"
      />
    )
  }
  return (
    <div className="border-[3px] border-stroke bg-paper p-2">
      <div className="font-display text-[10px] uppercase tracking-wider text-ink mb-2 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[9px] opacity-70">blur {blurPx}px</span>
      </div>
      <div className="aspect-[4/3] overflow-hidden bg-cream-soft relative border-[2px] border-stroke">
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 ease-out"
          style={{
            filter: `blur(${blurPx}px)`,
            transform: blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
          }}
        />
      </div>
    </div>
  )
}

function ChestPanel({
  opened,
  disabled,
  onOpen,
  chestLogoUrl,
  jackpotUntil,
}: {
  opened: boolean
  disabled?: boolean
  onOpen: () => void
  chestLogoUrl: string
  jackpotUntil: number | null
}) {
  return opened ? (
    <div className="border-[3px] border-stroke bg-paper p-2 archive-chest-open">
      <div className="font-display text-[10px] uppercase tracking-wider text-mustard mb-2 flex items-center gap-2">
        <KeyRound className="h-3 w-3 stroke-[3]" /> Sealed chest · partial logo
      </div>
      <div className="aspect-[4/3] overflow-hidden bg-cream-soft border-[2px] border-stroke">
        <img src={chestLogoUrl} alt="" className="w-full h-full object-cover" />
      </div>
    </div>
  ) : (
    <ArchiveObject
      title="Sealed chest"
      icon={<span className="text-2xl leading-none">🔒</span>}
      cost={ARCHIVE_COSTS.chest}
      opened={false}
      disabled={disabled || !!jackpotUntil}
      onOpen={onOpen}
      hint="Cropped title logo"
    />
  )
}

function MysteryBoxPanel({
  label,
  found,
  opened,
  box,
  disabled,
  cost,
  onOpen,
}: {
  label: string
  found: boolean
  opened: boolean
  box: ArchiveMysteryBox
  disabled?: boolean
  cost: number
  onOpen: () => void
}) {
  if (!found) {
    return (
      <div className="border-[3px] border-dashed border-stroke bg-cream-soft p-3 min-h-[88px] flex items-center justify-center text-ink-soft">
        <div className="font-display text-[10px] uppercase tracking-wider opacity-60">
          ? hidden ?
        </div>
      </div>
    )
  }
  if (opened) {
    const tone =
      box.type === 'jackpot'
        ? 'border-mustard'
        : box.type === 'redHerring'
          ? 'border-coral'
          : box.type === 'lore'
            ? 'border-lime'
            : 'border-blue'
    return (
      <div className={cn('border-[3px] bg-paper p-3', tone)}>
        <div className="font-display text-[10px] uppercase tracking-wider text-ink mb-2 flex items-center justify-between">
          <span>{label}</span>
          <span className="opacity-70">{box.type}</span>
        </div>
        <div className="text-sm font-serif italic text-ink leading-snug">
          {box.text}
        </div>
        {box.type === 'redHerring' && box.game && (
          <div className="mt-2 text-[10px] uppercase tracking-wider text-coral font-display">
            ↑ this clue is about {box.game}, not the answer.
          </div>
        )}
      </div>
    )
  }
  return (
    <ArchiveObject
      title={label}
      icon={<span className="text-2xl leading-none">📦</span>}
      cost={cost}
      opened={false}
      disabled={disabled}
      onOpen={onOpen}
      hint="?"
    />
  )
}

function TrashCan({
  rummaged,
  outcome,
  disabled,
  onRummage,
  crossedOut,
}: {
  rummaged: boolean
  outcome: ArchiveSession['trashOutcome']
  disabled?: boolean
  onRummage: () => void
  crossedOut: string
}) {
  const [rummaging, setRummaging] = useState(false)
  function go() {
    if (rummaging || rummaged || disabled) return
    setRummaging(true)
    window.setTimeout(() => {
      setRummaging(false)
      onRummage()
    }, 2200)
  }
  if (rummaged) {
    return (
      <div className="border-[3px] border-stroke bg-paper p-3">
        <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink mb-2 flex items-center gap-2">
          <Trash2 className="h-3 w-3 stroke-[3]" /> Trash can · rummaged
        </div>
        {outcome === 'crossed' && (
          <div className="font-serif italic text-ink">
            A torn-up paper:{' '}
            <span className="line-through text-coral not-italic font-bold">
              {crossedOut}
            </span>
            <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1 font-display">
              Crossed out — not the answer.
            </div>
          </div>
        )}
        {outcome === 'mysteryB' && (
          <div className="font-serif italic text-ink">
            You fish out a small parcel. (See the mystery box.)
          </div>
        )}
        {outcome === 'nothing' && (
          <div className="font-serif italic text-ink-soft">
            Just banana peels and old printouts. Nothing useful.
          </div>
        )}
      </div>
    )
  }
  return (
    <button
      onClick={go}
      disabled={disabled || rummaging}
      className={cn(
        'archive-tile archive-tile-closed p-3 flex flex-col items-center justify-center gap-1 min-h-[88px] text-ink w-full',
        'disabled:opacity-50',
        rummaging && 'archive-rummage',
      )}
    >
      <span className="text-2xl leading-none">🗑️</span>
      <div className="font-display text-[10px] uppercase tracking-wider font-bold">
        {rummaging ? 'Rummaging…' : 'Trash can · free'}
      </div>
      <div className="text-[10px] font-display uppercase opacity-70">
        Crossed-out / box / nothing
      </div>
    </button>
  )
}

function Waveform({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-8">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-1 bg-mustard archive-wave',
            playing ? 'opacity-100' : 'opacity-30',
          )}
          style={{
            animationDelay: `${i * 0.07}s`,
            animationPlayState: playing ? 'running' : 'paused',
            height: `${20 + ((i * 13) % 60)}%`,
          }}
        />
      ))}
    </div>
  )
}

function CaseDossier({
  wrongs,
  maxWrong,
  weeklyTheme,
}: {
  wrongs: WrongStamp[]
  maxWrong: number
  weeklyTheme?: string
}) {
  return (
    <div className="border-neo-2 bg-cream-soft p-3">
      {weeklyTheme && (
        <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mb-2">
          ▸ Lead · {weeklyTheme}
        </div>
      )}
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1 text-ink">
        Dismissed suspects · {wrongs.length} / {maxWrong}
      </div>
      {wrongs.length > 0 ? (
        <ul className="space-y-0.5">
          {wrongs.map((w, i) => (
            <li key={i} className="text-sm font-serif italic text-ink">
              <span className="text-coral font-bold mr-1">✗</span>
              <span className="line-through opacity-80">{w.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm font-serif italic text-ink-soft">
          No suspects ruled out yet. Open clues to gather evidence, then name the
          game.
        </div>
      )}
    </div>
  )
}

// ─── opened clues table (rendered on the desk) ───────────────────────────────

type OpenedClue = {
  key: string
  label: string
  body: string
  tone?: 'paper' | 'mustard' | 'coral' | 'lime' | 'blue'
}

function buildOpenedClues(
  s: ArchiveSession,
  p: ArchivePuzzle,
  trashOutcome: 'crossed' | 'mysteryB' | 'nothing',
): OpenedClue[] {
  const out: OpenedClue[] = []
  if (s.opened.shelfA) out.push({ key: 'sa', label: 'Year', body: p.clue_year })
  if (s.opened.shelfB) out.push({ key: 'sb', label: 'Genre', body: p.clue_genre })
  if (s.opened.shelfC)
    out.push({ key: 'sc', label: 'Platform', body: p.clue_platform })
  if (s.opened.drawerTop)
    out.push({ key: 'dt', label: 'Pitch', body: p.clue_pitch })
  if (s.opened.drawerMid)
    out.push({ key: 'dm', label: 'Memo (internal)', body: p.clue_memo })
  if (s.opened.drawerBot)
    out.push({ key: 'db', label: 'Review', body: p.clue_review })
  if (s.radio) out.push({ key: 'r', label: 'OST', body: '(playing in the room)' })
  if (s.mysteryAOpened)
    out.push({
      key: 'ma',
      label: `Mystery A · ${p.mystery_a.type}`,
      body: p.mystery_a.text,
      tone:
        p.mystery_a.type === 'jackpot'
          ? 'mustard'
          : p.mystery_a.type === 'redHerring'
            ? 'coral'
            : 'paper',
    })
  if (s.mysteryBOpened)
    out.push({
      key: 'mb',
      label: `Mystery B · ${p.mystery_b.type}`,
      body: p.mystery_b.text,
      tone:
        p.mystery_b.type === 'jackpot'
          ? 'mustard'
          : p.mystery_b.type === 'redHerring'
            ? 'coral'
            : 'paper',
    })
  if (s.trashRummaged && trashOutcome === 'crossed')
    out.push({
      key: 't',
      label: 'Trash · crossed out',
      body: `Not the answer: ${p.trash_crossed_out}`,
      tone: 'coral',
    })
  return out
}

function ClueCard({ clue }: { clue: OpenedClue }) {
  return (
    <NeoCard tone={clue.tone ?? 'paper'} shadow="sm" className="p-3">
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
        {clue.label}
      </div>
      <div className="text-sm font-serif italic">{clue.body}</div>
    </NeoCard>
  )
}

// ─── end-of-game ─────────────────────────────────────────────────────────────

function computeRank(s: ArchiveSession): {
  title: string
  blurb: string
} {
  const candles = s.candles
  if (candles >= 4) return { title: 'Archivist', blurb: 'You barely lit a match.' }
  if (candles >= 3) return { title: 'Detective', blurb: 'Calm and economical.' }
  if (candles >= 2) return { title: 'Investigator', blurb: 'Solid work, agent.' }
  if (candles >= 1) return { title: 'Intern', blurb: 'You’re learning.' }
  return { title: 'Ghost', blurb: 'You burned the whole drawer.' }
}

function FinaleCard({
  status,
  answer,
  rank,
  shareString,
  wrongCount,
  candlesLeft,
  clues,
}: {
  status: 'solved' | 'lost' | 'playing'
  answer: IgdbGame
  rank: { title: string; blurb: string } | null
  shareString: string | null
  wrongCount: number
  candlesLeft: number
  clues: OpenedClue[]
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <NeoCard
        tone={status === 'solved' ? 'lime' : 'coral'}
        shadow="md"
        className="p-4"
      >
        <div className="font-display text-[10px] uppercase tracking-wider font-bold">
          {status === 'solved' ? 'Case closed' : 'Case file sealed'}
        </div>
        <div className="font-display text-2xl font-bold leading-tight mt-1">
          {answer.name}
        </div>
        <div className="text-xs mt-1 uppercase tracking-wider opacity-80">
          {answer.year} · {answer.genre}
        </div>
        {rank && (
          <div className="mt-3 border-neo-2 bg-paper text-ink px-3 py-2 inline-block">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold mr-2">
              Rank
            </span>
            <span className="font-display text-base font-bold">{rank.title}</span>
            <span className="text-[10px] ml-2 opacity-70">{rank.blurb}</span>
          </div>
        )}
        <div className="text-[10px] uppercase tracking-wider font-display mt-3 opacity-80">
          Candles left {candlesLeft} / {ARCHIVE_TOTAL_CANDLES} · Wrong{' '}
          {wrongCount} / {ARCHIVE_MAX_WRONG}
        </div>
        {shareString && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <NeoButton
              tone="mustard"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(shareString).then(() => {
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              <Share2 className="inline h-3 w-3 mr-1" />{' '}
              {copied ? 'Copied!' : 'Copy share'}
            </NeoButton>
            <pre className="bg-paper border-neo-2 text-ink p-2 text-[11px] font-display whitespace-pre overflow-x-auto">
              {shareString}
            </pre>
          </div>
        )}
      </NeoCard>
      {clues.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2">
            Clue breakdown
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clues.map((c) => (
              <ClueCard key={c.key} clue={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildShareString(
  s: ArchiveSession,
  _p: ArchivePuzzle,
  week: string,
): string {
  const candles = '🕯️'.repeat(s.candles) + '·'.repeat(ARCHIVE_TOTAL_CANDLES - s.candles)
  const wrongs = '✗'.repeat(s.wrongs.length) + '·'.repeat(ARCHIVE_MAX_WRONG - s.wrongs.length)
  const opened =
    Object.values(s.opened).filter(Boolean).length +
    (s.radio ? 1 : 0) +
    s.frames.filter(Boolean).length +
    (s.mysteryAOpened ? 1 : 0) +
    (s.mysteryBOpened ? 1 : 0) +
    (s.chestOpened ? 1 : 0)
  const headline = s.status === 'solved' ? '★ Archived' : '✗ Cold case'
  return `The Archive · Week ${weekNumber(week)}
${headline}
${candles}  ${wrongs}
clues opened: ${opened}`
}

// ─── dust particles + style block ───────────────────────────────────────────

function DustLayer() {
  const dust = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        left: (i * 53) % 100,
        top: (i * 37) % 100,
        delay: (i * 0.3) % 5,
        dur: 8 + ((i * 7) % 9),
      })),
    [],
  )
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden
    >
      {dust.map((d, i) => (
        <div
          key={i}
          className="absolute w-[3px] h-[3px] rounded-full bg-ink/30 archive-dust"
          style={{
            left: d.left + '%',
            top: d.top + '%',
            animationDelay: -d.delay + 's',
            animationDuration: d.dur + 's',
          }}
        />
      ))}
    </div>
  )
}

function ArchiveStyles() {
  // Scoped CSS for the archive room. Uses theme tokens (--color-paper,
  // --color-cream-soft, --color-stroke, --color-ink) so the room flips with
  // light/dark mode rather than living in its own brown palette.
  return (
    <style>{`
      /* Always-readable font inside the Archive screen — overrides the pixel
         display font everywhere under .archive-readable. Atkinson Hyperlegible
         is already loaded by index.html. */
      .archive-readable, .archive-readable * {
        font-family: 'Atkinson Hyperlegible', system-ui, sans-serif !important;
      }
      .archive-room {
        background:
          radial-gradient(ellipse at 50% 0%, var(--color-cream-soft) 0%, var(--color-cream) 60%),
          var(--color-cream);
        color: var(--color-ink);
      }
      .archive-tile {
        background: var(--color-paper);
        border: 3px solid var(--color-stroke);
        color: var(--color-ink);
        transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .archive-tile-open {
        border: 3px solid var(--color-stroke);
        color: var(--color-ink);
        /* Match the closed-tile floor so opening doesn't shrink the row. */
        min-height: 88px;
      }
      .archive-tile-closed:hover:not(:disabled) {
        background: var(--color-cream-soft);
        transform: translate(-1px, -1px);
        box-shadow: 3px 3px 0 var(--color-stroke);
      }
      .archive-locked {
        background: repeating-linear-gradient(
          45deg,
          var(--color-cream-soft),
          var(--color-cream-soft) 4px,
          var(--color-cream) 4px,
          var(--color-cream) 8px
        );
        border: 3px solid var(--color-stroke);
        opacity: 0.7;
      }
      .archive-glow:hover {
        box-shadow: 0 0 0 1px var(--color-mustard), 3px 3px 0 var(--color-stroke);
      }
      @keyframes archive-flame {
        0%, 100% { transform: scale(1) translateY(0); opacity: 0.95; }
        40% { transform: scale(1.15, 0.85) translateY(-1px); opacity: 1; }
        70% { transform: scale(0.9, 1.1) translateY(1px); opacity: 0.85; }
      }
      .archive-flame {
        background:
          radial-gradient(ellipse at 50% 100%, var(--color-mustard) 0%, var(--color-coral) 60%, transparent 80%);
        border-radius: 50% 50% 45% 45% / 60% 60% 40% 40%;
        animation: archive-flame 0.9s ease-in-out infinite;
        filter: blur(0.5px) drop-shadow(0 0 6px color-mix(in oklab, var(--color-mustard) 60%, transparent));
      }
      @keyframes archive-dust {
        0% { transform: translateY(0) translateX(0); opacity: 0; }
        20% { opacity: 0.6; }
        80% { opacity: 0.4; }
        100% { transform: translateY(-40px) translateX(20px); opacity: 0; }
      }
      .archive-dust {
        animation-name: archive-dust;
        animation-iteration-count: infinite;
        animation-timing-function: linear;
      }
      @keyframes archive-wave {
        0%, 100% { transform: scaleY(0.4); }
        50% { transform: scaleY(1); }
      }
      .archive-wave {
        animation: archive-wave 0.7s ease-in-out infinite;
        transform-origin: bottom;
      }
      @keyframes archive-stamp {
        0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
        40% { transform: scale(1.15) rotate(-12deg); opacity: 1; }
        100% { transform: scale(1) rotate(-12deg); opacity: 0; }
      }
      .archive-stamp {
        color: var(--color-paper-static);
        text-shadow: 0 0 4px color-mix(in oklab, var(--color-coral) 60%, transparent);
        border: 6px solid var(--color-coral);
        padding: 8px 22px;
        transform: rotate(-12deg);
        animation: archive-stamp 1.6s ease-out forwards;
        background: var(--color-coral);
        font-family: var(--font-display);
      }
      @keyframes archive-rummage {
        0% { transform: translate(0,0) rotate(0); }
        20% { transform: translate(-2px,1px) rotate(-2deg); }
        40% { transform: translate(2px,-1px) rotate(2deg); }
        60% { transform: translate(-1px,-2px) rotate(-1deg); }
        80% { transform: translate(1px,2px) rotate(1deg); }
        100% { transform: translate(0,0) rotate(0); }
      }
      .archive-rummage {
        animation: archive-rummage 0.5s ease-in-out infinite;
      }
      .archive-chest-open {
        box-shadow: 0 0 20px color-mix(in oklab, var(--color-mustard) 25%, transparent) inset;
      }
      @keyframes archive-spare-glint {
        0%, 100% { opacity: 0; }
        50% { opacity: 0.3; }
      }
      .archive-spare-glint {
        animation: archive-spare-glint 5s ease-in-out infinite;
      }
      .archive-volume {
        -webkit-appearance: none;
        appearance: none;
        background: var(--color-stroke);
        border-radius: 0;
        outline: none;
      }
      .archive-volume::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 10px;
        height: 14px;
        background: var(--color-mustard);
        border: 2px solid var(--color-stroke);
        cursor: pointer;
      }
      .archive-volume::-moz-range-thumb {
        width: 10px;
        height: 14px;
        background: var(--color-mustard);
        border: 2px solid var(--color-stroke);
        cursor: pointer;
        border-radius: 0;
      }
    `}</style>
  )
}
