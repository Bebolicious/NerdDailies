import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  BookOpen,
  Flame,
  Lock,
  Music,
  Pause,
  Radio,
  Scroll,
  Search,
  Share2,
  Trash2,
  Unlock,
} from 'lucide-react'
import { GameSearch } from '../components/game/GameSearch'
import { NeoCard } from '../components/ui/NeoCard'
import { NeoButton } from '../components/ui/NeoButton'
import { InfoButton } from '../components/ui/InfoButton'
import { GuestBanner } from '../components/ui/GuestBanner'
import { ScreenEffects } from '../components/ui/ScreenEffects'
import { useArchivePuzzle } from '../hooks/usePuzzle'
import { todayISO, weekNumber, weekStartISO } from '../lib/dates'
import { cn } from '../lib/cn'
import { saveResult } from '../lib/scoreStore'
import { ARCHIVE_HIDING_SPOTS, subjectChip } from '../lib/archivePresets'
import {
  blurPx,
  buildShareString,
  claimSpareCandle,
  clueCost,
  computeRank,
  emptySession,
  isFound,
  guessGame,
  guessLink,
  jackpotSealed,
  loadSession,
  openClue as open,
  persistSession,
  revealAllClues,
  searchSpot,
  type ArchiveSession,
  type ArchiveWrong,
} from '../lib/archiveSession'
import {
  ARCHIVE_MAX_WRONG,
  type ArchiveClue,
  type ArchiveClueSubject,
  type ArchiveHidingSpot,
  type ArchivePuzzle,
  type Game,
} from '../lib/types'

// The Archive — the weekly escape-room. Three answers per week (two mystery
// games plus a freehand "what do they have in common"), and a room whose
// contents are entirely authored: `puzzle.clues` is a flat list and every entry
// carries its own container, emoji, name, subject, cost and body. Nothing in
// this file hardcodes what a clue *is*; see `lib/archivePresets.ts`.

// ─── page ───────────────────────────────────────────────────────────────────

export function ArchiveGame() {
  const today = todayISO()
  const week = weekStartISO(today)
  const puzzle = useArchivePuzzle(week)
  if (!puzzle)
    return <div className="text-sm text-ink-soft">Loading archive…</div>
  return <ArchiveRoom key={puzzle.id} puzzle={puzzle} week={week} />
}

// Exported so the room can be rendered against a known puzzle + week without
// going through the async fetch.
export function ArchiveRoom({
  puzzle,
  week,
}: {
  puzzle: ArchivePuzzle
  week: string
}) {
  const [state, setState] = useState<ArchiveSession>(
    () => loadSession(week) ?? emptySession(Date.now(), puzzle.candles),
  )

  useEffect(() => {
    persistSession(week, state)
  }, [week, state])

  const wrongCount = state.wrongs.length
  const finished = state.status !== 'playing'
  const clues = puzzle.clues
  // Post-game "show me the rest of the room" — every clue reads as open, every
  // hiding spot as found. Never true while playing (`revealAllClues` guards it).
  const revealedAll = !!state.revealedAll

  // Mirror a finished run to the global score store (streak / stats / sidebar).
  // Done in an effect rather than inside a reducer so the write happens after
  // the state that caused it has committed. The guard is a ref, not state —
  // "have I told the external system" isn't something the UI renders. Re-
  // reporting on a later visit would be harmless anyway: every field it writes
  // comes from the persisted session, so the write is idempotent.
  const reported = useRef(false)
  useEffect(() => {
    if (state.status === 'playing' || reported.current) return
    reported.current = true
    recordResult(week, state, state.linkSolved ? puzzle.game_a : null)
  }, [state, week, puzzle.game_a])

  // jackpot timer — auto-clear when expired
  useEffect(() => {
    if (!state.jackpotUntil) return
    const ms = Math.max(0, state.jackpotUntil - Date.now())
    const t = window.setTimeout(
      () => setState((s) => ({ ...s, jackpotUntil: null, jackpotSrc: null })),
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

  const byContainer = useMemo(() => {
    const out: Record<string, ArchiveClue[]> = {}
    for (const c of clues) (out[c.container] ??= []).push(c)
    return out
  }, [clues])

  // Only render a prop for a hiding spot this week actually uses, so an empty
  // corner is never a false lead. The trash is the exception: a crossed-out
  // title is content in its own right, so it keeps the bin searchable even when
  // nothing is stashed in it.
  const spotsInUse = useMemo(() => {
    const set = new Set<ArchiveHidingSpot>()
    for (const c of clues) if (c.hiddenSpot) set.add(c.hiddenSpot)
    if (puzzle.trash_crossed_out) set.add('trash')
    return ARCHIVE_HIDING_SPOTS.filter((s) => set.has(s.id))
  }, [clues, puzzle.trash_crossed_out])

  const stillHidden = spotsInUse.filter((s) => !state.foundSpots[s.id]).length
  const blur = blurPx(state)
  const sealed = jackpotSealed(state)

  const openClue = useCallback(
    (clue: ArchiveClue) => setState((prev) => open(prev, clue)),
    [],
  )
  const findSpot = useCallback(
    (spot: ArchiveHidingSpot) => setState((prev) => searchSpot(prev, spot)),
    [],
  )
  const onGuessGame = useCallback(
    (g: Game) => setState((prev) => guessGame(prev, g, puzzle, week)),
    [puzzle, week],
  )
  const onGuessLink = useCallback(
    (text: string) => setState((prev) => guessLink(prev, text, puzzle, week)),
    [puzzle, week],
  )

  const openedClues = useMemo(
    () => clues.filter((c) => state.opened[c.id]),
    [clues, state.opened],
  )
  // The dossier files everything once the room is thrown open, but the counter
  // below it still reports what was actually paid for.
  const dossierClues = revealedAll ? clues : openedClues

  const rank = useMemo(
    () =>
      state.status === 'solved'
        ? computeRank(state.candles, puzzle.candles, state.wrongs.length)
        : null,
    [state.status, state.candles, state.wrongs.length, puzzle.candles],
  )

  const shareString = useMemo(
    () => (finished ? buildShareString(state, puzzle, weekNumber(week)) : null),
    [finished, state, puzzle, week],
  )

  const tileProps = {
    state,
    finished,
    revealedAll,
    blurPx: blur,
    jackpotSealed: sealed,
    onOpen: openClue,
    isFound: (clue: ArchiveClue) => isFound(state, clue),
  }

  return (
    <div className="archive-readable @container">
      <ArchiveStyles />
      <ScreenEffects
        type={puzzle.effectType}
        emoji={puzzle.effectEmoji}
        color={puzzle.effectColor}
        active={finished}
      />

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
          text={`Weekly. Three answers: two mystery games and the one thing they have in common. You get ${puzzle.candles} candles and ${ARCHIVE_MAX_WRONG} wrong guesses for the whole case. Spend candles to open clues — what a clue points at is only revealed once you've paid for it. Some clues are hidden around the room; hunt for them, finding them is free. Every wrong guess locks a sealed clue.`}
        />
      </div>

      {puzzle.weekly_theme && (
        <div className="mb-3 text-xs uppercase tracking-[0.2em] text-ink-soft font-display">
          ▸ {puzzle.weekly_theme}
        </div>
      )}

      {/*
        Room left, desk right. A CONTAINER query, not a viewport one, because
        what matters is the width this page actually got — the 340px sidebar
        takes a big bite out of it. Above the threshold the desk is a fixed
        column and the room absorbs every remaining pixel (the room is the
        game; the case file is just the notepad). Below it the desk drops to
        its own full-width row underneath, which is the phone layout.
      */}
      <div className="flex flex-col @min-[1100px]:flex-row gap-5 @min-[1100px]:items-start">
        {/* `flex-1` is row-only on purpose: its 0% basis would apply to HEIGHT
            in the stacked column layout and collapse the room. */}
        <div className="w-full min-w-0 @min-[1100px]:flex-1 @container">
          <div className="archive-room border-neo shadow-neo-lg relative overflow-hidden">
            {(puzzle.bannerText || puzzle.submitter) && finished && (
              <GuestBanner
                gameType="archive"
                submitter={puzzle.submitter}
                text={puzzle.bannerText}
                color={puzzle.bannerColor}
                textColor={puzzle.bannerTextColor}
                style={puzzle.bannerStyle}
              />
            )}
            <DustLayer />

            {/* Header band — candles, stamps, hunt counter */}
            <div className="relative z-10 px-5 py-4 flex items-center justify-between gap-4 flex-wrap border-b-[3px] border-stroke bg-paper">
              <CandleCounter candles={state.candles} total={puzzle.candles} />
              <WrongStamps wrongs={state.wrongs} max={ARCHIVE_MAX_WRONG} />
            </div>
            {stillHidden > 0 && !finished && (
              <div className="relative z-10 px-5 pt-3 font-display text-[10px] uppercase tracking-wider text-ink-soft">
                🔍 {stillHidden} thing{stillHidden === 1 ? '' : 's'} still hidden
                somewhere in this room
              </div>
            )}

            {/* Wall — framed things + the chest */}
            {(byContainer.wall || byContainer.chest) && (
              <div className="relative z-10 px-5 pt-5 grid grid-cols-1 @min-[440px]:grid-cols-2 @min-[640px]:grid-cols-3 gap-3">
                {(byContainer.wall ?? []).map((c) => (
                  <ClueTile key={c.id} clue={c} {...tileProps} />
                ))}
                {(byContainer.chest ?? []).map((c) => (
                  <ClueTile key={c.id} clue={c} chest {...tileProps} />
                ))}
              </div>
            )}

            {/* Furniture — bookshelf | filing cabinet | radio */}
            <div className="relative z-10 px-5 pt-5 grid grid-cols-1 @min-[660px]:grid-cols-2 gap-3">
              {byContainer.shelf && (
                <Furniture icon={<BookOpen className="h-3 w-3 stroke-[3]" />} label="Bookshelf">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {byContainer.shelf.map((c) => (
                      <ClueTile key={c.id} clue={c} {...tileProps} />
                    ))}
                  </div>
                </Furniture>
              )}
              {byContainer.cabinet && (
                <Furniture icon={<Scroll className="h-3 w-3 stroke-[3]" />} label="Filing cabinet">
                  <div className="flex flex-col gap-2">
                    {byContainer.cabinet.map((c) => (
                      <ClueTile key={c.id} clue={c} drawer {...tileProps} />
                    ))}
                  </div>
                  <SpareCandle
                    claimed={state.spareCandleClaimed}
                    visible={state.candles < Math.ceil(puzzle.candles / 2)}
                    disabled={finished}
                    onClaim={() =>
                      setState((p) => claimSpareCandle(p, puzzle.candles))
                    }
                  />
                </Furniture>
              )}
              {byContainer.radio && (
                <Furniture icon={<Radio className="h-3 w-3 stroke-[3]" />} label="Radio">
                  <div className="flex flex-col gap-2">
                    {byContainer.radio.map((c) => (
                      <ClueTile key={c.id} clue={c} {...tileProps} />
                    ))}
                  </div>
                </Furniture>
              )}
              {byContainer.mystery && (
                <Furniture icon={<span className="text-[11px] leading-none">📦</span>} label="Unmarked parcels">
                  <div className="grid grid-cols-2 gap-2">
                    {byContainer.mystery.map((c) => (
                      <ClueTile key={c.id} clue={c} {...tileProps} />
                    ))}
                  </div>
                </Furniture>
              )}
            </div>

            {/* Hiding spots — scattered around the room, free to search */}
            <div className="relative z-10 px-5 pt-5 pb-6">
              <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mb-2 flex items-center gap-2">
                <Search className="h-3 w-3 stroke-[3]" /> Search the room · free
              </div>
              <div className="flex flex-wrap gap-2">
                {spotsInUse.length === 0 && (
                  <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft opacity-70">
                    Nothing hidden this week.
                  </div>
                )}
                {spotsInUse.map((spot) => (
                  <HidingSpot
                    key={spot.id}
                    spot={spot}
                    found={!!state.foundSpots[spot.id] || revealedAll}
                    disabled={finished}
                    crossedOut={
                      spot.id === 'trash' ? puzzle.trash_crossed_out : undefined
                    }
                    onFind={() => findSpot(spot.id)}
                  />
                ))}
              </div>
            </div>

            {/* WRONG stamp toast */}
            {state.stampToast && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                aria-hidden
              >
                <div className="archive-stamp font-display text-3xl md:text-5xl uppercase tracking-widest font-bold">
                  ✗ Wrong Case File
                </div>
              </div>
            )}

            {/* Jackpot full-art flash */}
            {state.jackpotUntil && state.jackpotSrc && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 bg-black/80 backdrop-blur-sm">
                <div className="border-neo shadow-neo-lg p-3 bg-paper">
                  <img
                    src={state.jackpotSrc}
                    alt=""
                    className="w-64 max-w-[60vw] aspect-[4/5] object-cover"
                  />
                  <div className="font-display text-xs uppercase tracking-wider font-bold mt-2 text-center">
                    ★ Jackpot · full art
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desk — the case file: three answers + everything you've opened */}
        <div className="w-full shrink-0 @min-[1100px]:w-[400px] @min-[1500px]:w-[440px]">
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3 flex items-center gap-2">
              <Search className="h-3 w-3 stroke-[3]" /> Desk · case file
            </div>

            <AnswerSlots
              puzzle={puzzle}
              state={state}
              finished={finished}
              onGuessGame={onGuessGame}
              onGuessLink={onGuessLink}
            />

            {finished && (
              <div className="mt-4">
                <FinaleCard
                  status={state.status}
                  puzzle={puzzle}
                  rank={rank}
                  shareString={shareString}
                  wrongCount={wrongCount}
                  candlesLeft={state.candles}
                  revealedAll={revealedAll}
                  onRevealAll={() => setState(revealAllClues)}
                />
              </div>
            )}

            <DossierClues
              clues={dossierClues}
              opened={state.opened}
              blurPx={blur}
              wrongs={state.wrongs}
            />

            <div className="mt-4 text-[10px] uppercase tracking-wider text-ink-soft font-display">
              Wrong · {wrongCount} / {ARCHIVE_MAX_WRONG} · Candles ·{' '}
              {state.candles} / {puzzle.candles} · Clues opened ·{' '}
              {openedClues.length} / {clues.length}
            </div>
          </NeoCard>
        </div>
      </div>
    </div>
  )
}

// ─── result mirroring ───────────────────────────────────────────────────────

// Mirror to the global score store so streak / stats / sidebar pick the week
// up. The Archive has three answers but `PuzzleResult` is single-answer, so we
// report subject A as "the" game and the wrong stamps as the guess trail.
function recordResult(
  week: string,
  s: ArchiveSession,
  solvedGame: Game | null,
) {
  const wrongGuesses = s.wrongs.map((w) => ({
    kind: 'wrong' as const,
    game: { id: -1, name: w.label },
    at: w.at,
  }))
  saveResult({
    date: week,
    gameType: 'archive',
    status: s.status === 'solved' ? 'solved' : 'lost',
    guessCount: s.wrongs.length + (solvedGame ? 1 : 0),
    guesses: solvedGame
      ? [...wrongGuesses, { kind: 'correct', game: solvedGame, at: Date.now() }]
      : wrongGuesses,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt ?? Date.now(),
  })
  window.dispatchEvent(new Event('dailies:result-saved'))
}

// ─── answer slots ───────────────────────────────────────────────────────────

function AnswerSlots({
  puzzle,
  state,
  finished,
  onGuessGame,
  onGuessLink,
}: {
  puzzle: ArchivePuzzle
  state: ArchiveSession
  finished: boolean
  onGuessGame: (g: Game) => void
  onGuessLink: (text: string) => void
}) {
  const bothGames = !!state.solvedA && !!state.solvedB
  return (
    <div className="flex flex-col gap-2">
      <Slot
        label="Subject A"
        value={state.solvedA?.name ?? null}
        revealed={finished ? puzzle.game_a.name : null}
      />
      <Slot
        label="Subject B"
        value={state.solvedB?.name ?? null}
        revealed={finished ? puzzle.game_b.name : null}
      />
      <Slot
        label="The link"
        value={state.linkSolved ? puzzle.link.answer : null}
        revealed={finished ? puzzle.link.answer : null}
        locked={!bothGames && !finished}
        lockedHint="Name both games first"
      />

      {!finished && !bothGames && (
        <div className="mt-2">
          <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft mb-1">
            Name a subject — either one, any order
          </div>
          <GameSearch placeholder="Name the game…" onGuess={onGuessGame} direction="down" />
        </div>
      )}

      {!finished && bothGames && !state.linkSolved && (
        <LinkInput prompt={puzzle.link.prompt} onSubmit={onGuessLink} />
      )}
    </div>
  )
}

function Slot({
  label,
  value,
  revealed,
  locked,
  lockedHint,
}: {
  label: string
  value: string | null
  revealed: string | null
  locked?: boolean
  lockedHint?: string
}) {
  const solved = !!value
  return (
    <div
      className={cn(
        'border-neo-2 px-3 py-2 flex items-center gap-3',
        solved ? 'bg-lime text-ink-static' : 'bg-cream-soft text-ink',
      )}
    >
      <span className="font-display text-[10px] uppercase tracking-wider font-bold w-[74px] shrink-0">
        {label}
      </span>
      <span className="flex-1 min-w-0 text-sm font-bold truncate">
        {solved ? (
          <>✓ {value}</>
        ) : locked ? (
          <span className="opacity-60 font-normal italic">🔒 {lockedHint}</span>
        ) : revealed ? (
          <span className="text-coral">✗ {revealed}</span>
        ) : (
          <span className="opacity-50">???</span>
        )}
      </span>
    </div>
  )
}

// The third answer: freehand text, matched loosely (case / accents /
// punctuation / leading articles are all ignored — see `matchesLink`).
function LinkInput({
  prompt,
  onSubmit,
}: {
  prompt: string
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState('')
  function go() {
    const t = text.trim()
    if (!t) return
    setText('')
    onSubmit(t)
  }
  return (
    <div className="mt-2 border-neo-2 bg-cream-soft p-3">
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2 text-ink">
        Both subjects identified — last call
      </div>
      <div className="text-sm font-serif italic text-ink mb-2">{prompt}</div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go()
          }}
          placeholder="Type your answer…"
          aria-label="What the two games have in common"
          className="border-neo bg-paper px-3 py-2 text-sm font-bold outline-none flex-1 min-w-0"
        />
        <NeoButton tone="lime" size="sm" onClick={go} disabled={!text.trim()}>
          Submit
        </NeoButton>
      </div>
    </div>
  )
}

// ─── clue tiles ─────────────────────────────────────────────────────────────

type TileProps = {
  clue: ArchiveClue
  state: ArchiveSession
  finished: boolean
  revealedAll: boolean
  blurPx: number
  jackpotSealed: boolean
  onOpen: (clue: ArchiveClue) => void
  isFound: (clue: ArchiveClue) => boolean
  // chrome variants
  drawer?: boolean
  chest?: boolean
}

function ClueTile(props: TileProps) {
  const { clue, state, finished, revealedAll, blurPx, jackpotSealed, onOpen, isFound } =
    props
  // After the case closes the player can throw the room open: everything reads
  // as opened, including clues that were still stashed, locked or sealed.
  const bought = !!state.opened[clue.id]
  const opened = bought || revealedAll
  const locked = !!state.locked[clue.id]
  const found = isFound(clue)
  const isJackpot = clue.outcome === 'jackpot'
  const cost = clueCost(clue)
  const sealed = isJackpot && jackpotSealed && !opened
  const affordable = state.candles >= cost
  const disabled = finished || sealed || (!affordable && !opened)

  // Still stashed somewhere — the container shows a gap, not the clue.
  if (!found && !opened) {
    return (
      <div className="border-[3px] border-dashed border-stroke bg-cream-soft/50 p-3 min-h-[76px] flex items-center justify-center text-ink-soft">
        <span className="font-display text-[10px] uppercase tracking-wider opacity-60">
          ? ? ?
        </span>
      </div>
    )
  }

  if (locked && !opened) {
    return (
      <div className="archive-locked p-3 flex flex-col items-center justify-center gap-1 min-h-[76px] text-ink-soft">
        <Lock className="h-4 w-4 stroke-[2.5]" />
        <div className="font-display text-[10px] uppercase tracking-wider font-bold">
          Locked
        </div>
        <div className="text-[10px] font-display uppercase opacity-60 text-center leading-tight">
          {clue.name}
        </div>
      </div>
    )
  }

  if (opened)
    return (
      <OpenedTile
        clue={clue}
        blurPx={blurPx}
        chest={props.chest}
        missed={!bought}
      />
    )

  if (props.drawer)
    return (
      <DrawerFace
        cost={cost}
        disabled={disabled}
        onOpen={() => onOpen(clue)}
      />
    )

  return (
    <button
      onClick={() => onOpen(clue)}
      disabled={disabled}
      title={sealed ? 'Sealed until your last guess' : clue.name}
      className={cn(
        'archive-tile archive-tile-closed p-3 flex flex-col items-center justify-center gap-1 min-h-[76px] text-ink w-full',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isJackpot && 'archive-jackpot-tile relative overflow-hidden',
        props.chest && 'archive-chest-closed',
        !disabled && !isJackpot && 'archive-glow',
      )}
    >
      <span className="text-2xl leading-none">
        {sealed ? '🔒' : clue.emoji || '📦'}
      </span>
      <div className="font-display text-[10px] uppercase tracking-wider font-bold text-center leading-tight">
        {clue.name}
      </div>
      {isJackpot ? (
        <div className="font-display text-[9px] uppercase tracking-wider font-bold text-center leading-tight text-mustard-deep">
          {sealed ? '★ Sealed until your last guess' : '★ Jackpot · free — open it!'}
        </div>
      ) : (
        <div className="text-[10px] font-display uppercase opacity-80 flex items-center gap-1">
          <Flame className="h-3 w-3" /> {cost}
        </div>
      )}
    </button>
  )
}

// The filing cabinet, drawn as an actual drawer front: a recessed inner panel
// inset from the outer face, a pull handle dead centre, and the candle cost
// directly beneath it.
//
// Drawers are deliberately ANONYMOUS — no emoji, no name, no tooltip. Unlike a
// shelf box (where you're choosing a labelled thing), you just pick a drawer and
// take what's in it, so putting "Internal memo" on the front would give away the
// clue you're paying to uncover. The name only appears once it's open.
function DrawerFace({
  cost,
  disabled,
  onOpen,
}: {
  cost: number
  disabled?: boolean
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      aria-label={`Pull open a drawer · ${cost} candle${cost === 1 ? '' : 's'}`}
      className="archive-drawer w-full disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="archive-drawer-inner">
        <span className="archive-drawer-center">
          <DrawerHandle />
          <span className="font-display text-[10px] uppercase tracking-wider opacity-80 flex items-center gap-1 text-ink">
            <Flame className="h-3 w-3" /> {cost}
          </span>
        </span>
      </span>
    </button>
  )
}

function DrawerHandle() {
  return (
    <svg
      width="46"
      height="14"
      viewBox="0 0 46 14"
      aria-hidden
      className="shrink-0"
    >
      <rect x="7" y="1" width="5" height="5" fill="var(--color-stroke)" />
      <rect x="34" y="1" width="5" height="5" fill="var(--color-stroke)" />
      <rect
        x="1"
        y="5"
        width="44"
        height="7"
        rx="3.5"
        fill="var(--color-cream-soft)"
        stroke="var(--color-stroke)"
        strokeWidth="2"
      />
    </svg>
  )
}

// An opened clue in the room: it now admits what it points at (the subject chip
// is deliberately absent while sealed), plus a compact rendering of its body.
// Audio lives here — the desk just notes that it's playing in the room.
function OpenedTile({
  clue,
  blurPx,
  chest,
  missed,
}: {
  clue: ArchiveClue
  blurPx: number
  chest?: boolean
  // Only ever set after the case closed and the player unlocked the room: this
  // one they never actually paid for. Marked so the reveal stays honest about
  // which clues were really theirs.
  missed?: boolean
}) {
  return (
    <div
      className={cn(
        'archive-tile-open p-2.5 bg-cream-soft',
        chest && 'archive-chest-open',
        missed && 'archive-tile-missed',
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5 text-ink">
        {missed && (
          <span
            className="text-coral font-bold leading-none"
            title="You never opened this one"
            aria-label="Never opened"
          >
            ✗
          </span>
        )}
        <span className="text-base leading-none">{clue.emoji || '📄'}</span>
        <span className="font-display text-[10px] uppercase tracking-wider font-bold truncate flex-1 min-w-0">
          {clue.name}
        </span>
        <SubjectChip subject={clue.subject} />
      </div>
      {clue.body.kind === 'image' && (
        <div className="aspect-[4/3] overflow-hidden bg-paper relative border-[2px] border-stroke">
          <img
            src={clue.body.src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 ease-out"
            style={
              clue.body.sharpens
                ? {
                    filter: `blur(${blurPx}px)`,
                    transform: blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
                  }
                : undefined
            }
          />
        </div>
      )}
      {clue.body.kind === 'audio' && (
        <ClueAudio src={clue.body.src} caption={clue.body.caption} />
      )}
      {clue.body.kind === 'text' && (
        <div className="text-xs font-serif italic text-ink leading-snug line-clamp-3">
          {clue.body.text}
        </div>
      )}
    </div>
  )
}

function SubjectChip({ subject }: { subject: ArchiveClueSubject }) {
  const tone =
    subject === 'herring'
      ? 'bg-coral text-ink-static'
      : subject === 'link'
        ? 'bg-mustard text-ink-static'
        : subject === 'both'
          ? 'bg-blue text-paper-static'
          : 'bg-paper text-ink'
  return (
    <span
      className={cn(
        'shrink-0 border-[2px] border-stroke px-1.5 py-[1px] font-display text-[8px] uppercase tracking-wider font-bold',
        tone,
      )}
    >
      {subjectChip(subject)}
    </span>
  )
}

function ClueAudio({ src, caption }: { src: string; caption?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.7)
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])
  if (!src)
    return (
      <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
        No reel filed.
      </div>
    )
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Waveform playing={playing} />
      <audio
        ref={audioRef}
        src={src}
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
            else void a.play()
          }}
        >
          {playing ? (
            <Pause className="inline h-3 w-3 mr-1" />
          ) : (
            <Music className="inline h-3 w-3 mr-1" />
          )}
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
          className="archive-volume w-14 h-1 cursor-pointer"
        />
      </div>
      {caption && (
        <div className="font-display text-[9px] uppercase tracking-wider text-ink-soft text-center">
          {caption}
        </div>
      )}
    </div>
  )
}

// ─── room furniture + props ─────────────────────────────────────────────────

function Furniture({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border-[3px] border-stroke bg-paper p-3 relative">
      <div className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-soft mb-3 flex items-center gap-2">
        {icon} {label}
      </div>
      {children}
    </div>
  )
}

// Free to search, one click each (the trash keeps its rummaging beat). Finding
// a spot only *reveals* what's stashed there — opening it still costs candles.
function HidingSpot({
  spot,
  found,
  disabled,
  crossedOut,
  onFind,
}: {
  spot: (typeof ARCHIVE_HIDING_SPOTS)[number]
  found: boolean
  disabled?: boolean
  crossedOut?: string
  onFind: () => void
}) {
  const [busy, setBusy] = useState(false)
  const isTrash = spot.id === 'trash'
  function go() {
    if (busy || found || disabled) return
    if (!isTrash) return onFind()
    setBusy(true)
    window.setTimeout(() => {
      setBusy(false)
      onFind()
    }, 1600)
  }
  if (found) {
    return (
      <div className="border-[3px] border-stroke bg-cream-soft px-3 py-2 max-w-full">
        <div className="font-display text-[10px] uppercase tracking-wider text-ink flex items-center gap-1.5">
          {isTrash ? <Trash2 className="h-3 w-3 stroke-[3]" /> : '🔎'} {spot.label}
        </div>
        <div className="text-xs font-serif italic text-ink mt-1">{spot.found}</div>
        {isTrash && crossedOut && (
          <div className="text-xs font-serif italic text-ink mt-1">
            Also, a torn-up scrap:{' '}
            <span className="line-through text-coral not-italic font-bold">
              {crossedOut}
            </span>
          </div>
        )}
      </div>
    )
  }
  return (
    <button
      onClick={go}
      disabled={disabled || busy}
      title={`Search: ${spot.label}`}
      className={cn(
        'archive-tile archive-tile-closed archive-glow px-3 py-2 flex items-center gap-2 text-ink',
        'disabled:cursor-not-allowed disabled:opacity-50',
        busy && 'archive-rummage',
      )}
    >
      <span className="text-base leading-none">{isTrash ? '🗑️' : '🔎'}</span>
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        {busy ? 'Rummaging…' : spot.label}
      </span>
    </button>
  )
}

// A candle stub wedged behind the cabinet. One-time pickup, +1 candle, and it
// only surfaces once the player is genuinely low so it reads as a rescue
// rather than a flat freebie.
function SpareCandle({
  claimed,
  visible,
  disabled,
  onClaim,
}: {
  claimed: boolean
  visible: boolean
  disabled?: boolean
  onClaim: () => void
}) {
  if (claimed || !visible) return null
  return (
    <button
      onClick={onClaim}
      disabled={disabled}
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
  )
}

function CandleCounter({ candles, total }: { candles: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: total }).map((_, i) => {
        const lit = i < candles
        return (
          <div
            key={i}
            className={cn(
              'archive-candle relative w-4 h-6 flex items-end justify-center',
              !lit && 'opacity-30 grayscale',
            )}
            aria-label={lit ? 'lit candle' : 'spent candle'}
          >
            <div className="w-2.5 h-4 bg-paper-static border-[2px] border-stroke" />
            <div
              className="archive-flame absolute -top-1 w-2.5 h-2.5"
              style={{ animationDelay: `${i * 0.13}s` }}
            />
          </div>
        )
      })}
      <span className="ml-2 font-display text-[10px] uppercase tracking-wider text-ink">
        {candles} / {total}
      </span>
    </div>
  )
}

function WrongStamps({ wrongs, max }: { wrongs: ArchiveWrong[]; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-display text-[10px] uppercase tracking-wider text-ink">
        Wrong
      </span>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-5 h-5 border-[2px] border-stroke flex items-center justify-center font-display text-xs font-bold',
            wrongs[i] ? 'bg-coral text-ink-static' : 'bg-cream-soft text-ink-soft',
          )}
        >
          {wrongs[i] ? '✗' : ''}
        </div>
      ))}
    </div>
  )
}

function Waveform({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-6">
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

// ─── the dossier (opened clues, grouped by what they point at) ──────────────

const SUBJECT_ORDER: ArchiveClueSubject[] = ['a', 'b', 'both', 'link', 'herring']

function DossierClues({
  clues,
  opened,
  blurPx,
  wrongs,
}: {
  clues: ArchiveClue[]
  // What was actually paid for. Only differs from `clues` once the room has
  // been thrown open post-game, where it tells the missed clues apart.
  opened: Record<string, boolean>
  blurPx: number
  wrongs: ArchiveWrong[]
}) {
  const groups = SUBJECT_ORDER.map((subject) => ({
    subject,
    items: clues.filter((c) => c.subject === subject),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="border-neo-2 bg-cream-soft p-3">
        <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1 text-ink">
          Dismissed · {wrongs.length}
        </div>
        {wrongs.length > 0 ? (
          <ul className="space-y-0.5">
            {wrongs.map((w, i) => (
              <li key={i} className="text-sm font-serif italic text-ink">
                <span className="text-coral font-bold mr-1">✗</span>
                <span className="line-through opacity-80">{w.label}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-60 ml-2 font-display not-italic">
                  {w.target === 'link' ? 'link' : 'game'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm font-serif italic text-ink-soft">
            Nothing ruled out yet. Open clues, then name your subjects.
          </div>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.subject}>
          <div className="font-display text-[10px] uppercase tracking-[0.2em] font-bold mb-2 flex items-center gap-2">
            ▸ {subjectChip(g.subject)}
            <span className="text-ink-soft opacity-70">· {g.items.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {g.items.map((c) => (
              <DossierCard
                key={c.id}
                clue={c}
                blurPx={blurPx}
                missed={!opened[c.id]}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DossierCard({
  clue,
  blurPx,
  missed,
}: {
  clue: ArchiveClue
  blurPx: number
  missed?: boolean
}) {
  const tone =
    clue.subject === 'herring'
      ? 'coral'
      : clue.subject === 'link'
        ? 'mustard'
        : 'paper'
  return (
    <NeoCard
      tone={tone}
      shadow="sm"
      className={cn('p-3', missed && 'archive-tile-missed')}
    >
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
        <span className="text-sm leading-none">{clue.emoji || '📄'}</span>
        <span className="min-w-0 truncate">{clue.name}</span>
        {missed && (
          <span className="ml-auto shrink-0 text-[9px] tracking-wider opacity-70">
            ✗ never opened
          </span>
        )}
      </div>
      {clue.body.kind === 'text' && (
        <div className="text-sm font-serif italic">{clue.body.text}</div>
      )}
      {clue.body.kind === 'image' && (
        <div className="overflow-hidden bg-cream-soft border-[2px] border-stroke aspect-[4/3] relative">
          <img
            src={clue.body.src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 ease-out"
            style={
              clue.body.sharpens
                ? {
                    filter: `blur(${blurPx}px)`,
                    transform: blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
                  }
                : undefined
            }
          />
        </div>
      )}
      {clue.body.kind === 'audio' && (
        <div className="text-sm font-serif italic opacity-80">
          ♪ Playing in the room{clue.body.caption ? ` — ${clue.body.caption}` : ''}.
        </div>
      )}
    </NeoCard>
  )
}

// ─── end-of-game ─────────────────────────────────────────────────────────────

function FinaleCard({
  status,
  puzzle,
  rank,
  shareString,
  wrongCount,
  candlesLeft,
  revealedAll,
  onRevealAll,
}: {
  status: 'solved' | 'lost' | 'playing'
  puzzle: ArchivePuzzle
  rank: { title: string; blurb: string } | null
  shareString: string | null
  wrongCount: number
  candlesLeft: number
  revealedAll: boolean
  onRevealAll: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <NeoCard
      tone={status === 'solved' ? 'lime' : 'coral'}
      shadow="md"
      className="p-4"
    >
      <div className="font-display text-[10px] uppercase tracking-wider font-bold">
        {status === 'solved' ? 'Case closed' : 'Case file sealed'}
      </div>
      <div className="mt-2 flex flex-col gap-1 text-sm">
        <div>
          <strong className="font-display text-[10px] uppercase tracking-wider mr-2">
            A
          </strong>
          {puzzle.game_a.name}
          {puzzle.game_a.year ? ` (${puzzle.game_a.year})` : ''}
        </div>
        <div>
          <strong className="font-display text-[10px] uppercase tracking-wider mr-2">
            B
          </strong>
          {puzzle.game_b.name}
          {puzzle.game_b.year ? ` (${puzzle.game_b.year})` : ''}
        </div>
        <div>
          <strong className="font-display text-[10px] uppercase tracking-wider mr-2">
            Link
          </strong>
          {puzzle.link.answer}
        </div>
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
        Candles left {candlesLeft} / {puzzle.candles} · Wrong {wrongCount} /{' '}
        {ARCHIVE_MAX_WRONG}
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

      {/* The case is closed either way, so there's nothing left to protect:
          open every drawer, box and cassette and go see what you missed. */}
      <div className="mt-3">
        {revealedAll ? (
          <div className="font-display text-[10px] uppercase tracking-wider opacity-80">
            🔓 Room unlocked · every clue is open — go have a look
          </div>
        ) : (
          <NeoButton tone="paper" size="sm" onClick={onRevealAll}>
            <Unlock className="inline h-3 w-3 mr-1" /> Unlock the whole room
          </NeoButton>
        )}
      </div>
    </NeoCard>
  )
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
        min-height: 76px;
      }
      .archive-tile-closed:hover:not(:disabled) {
        background: var(--color-cream-soft);
        transform: translate(-1px, -1px);
        box-shadow: 3px 3px 0 var(--color-stroke);
      }
      /* A clue only visible because the room was unlocked after the case
         closed — dashed edge so a post-game browse never reads as part of
         the run the player actually made. */
      .archive-tile-missed {
        border-style: dashed;
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

      /* ── Filing-cabinet drawer ────────────────────────────────────────────
         Outer face + an inner panel inset from it, which is what reads as a
         recessed drawer front. Handle dead centre, candle cost beneath it. */
      .archive-drawer {
        display: block;
        background: var(--color-paper);
        border: 3px solid var(--color-stroke);
        padding: 5px;
        transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .archive-drawer:hover:not(:disabled) {
        background: var(--color-cream-soft);
        transform: translate(-1px, -1px);
        box-shadow: 3px 3px 0 var(--color-stroke);
      }
      .archive-drawer-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 58px;
        padding: 6px 10px;
        border: 2px solid var(--color-stroke);
        background: linear-gradient(
          180deg,
          color-mix(in oklab, var(--color-cream-soft) 60%, transparent) 0%,
          transparent 45%
        );
      }
      .archive-drawer-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
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
      .archive-chest-closed {
        box-shadow: 0 0 12px color-mix(in oklab, var(--color-mustard) 18%, transparent) inset;
      }
      .archive-chest-open {
        box-shadow: 0 0 20px color-mix(in oklab, var(--color-mustard) 25%, transparent) inset;
      }
      /* Jackpot mystery box — a golden border that endlessly shimmers so it
         reads as the prize in the room, whether it's still sealed (locked
         until the last guess) or ready to open. */
      @keyframes archive-jackpot-shimmer {
        0%, 100% {
          border-color: var(--color-mustard);
          box-shadow:
            0 0 6px color-mix(in oklab, var(--color-mustard) 50%, transparent),
            0 0 14px color-mix(in oklab, var(--color-mustard-deep) 35%, transparent);
        }
        50% {
          border-color: var(--color-mustard-deep);
          box-shadow:
            0 0 12px color-mix(in oklab, var(--color-mustard) 75%, transparent),
            0 0 26px color-mix(in oklab, var(--color-mustard-deep) 55%, transparent);
        }
      }
      .archive-jackpot-tile {
        background: var(--color-paper);
        border: 3px solid var(--color-mustard);
        animation: archive-jackpot-shimmer 1.8s ease-in-out infinite;
      }
      /* A diagonal gold sheen sweeping across the lid. */
      .archive-jackpot-tile::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          115deg,
          transparent 30%,
          color-mix(in oklab, var(--color-mustard) 55%, transparent) 50%,
          transparent 70%
        );
        transform: translateX(-130%);
        animation: archive-jackpot-sweep 2.6s ease-in-out infinite;
        pointer-events: none;
      }
      @keyframes archive-jackpot-sweep {
        0% { transform: translateX(-130%); }
        60%, 100% { transform: translateX(130%); }
      }
      .archive-jackpot-tile:disabled { cursor: not-allowed; }
      .archive-jackpot-tile:not(:disabled):hover { transform: translate(-1px, -1px); }
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
      @media (prefers-reduced-motion: reduce) {
        .archive-dust, .archive-flame, .archive-wave,
        .archive-jackpot-tile, .archive-jackpot-tile::after,
        .archive-rummage, .archive-spare-glint {
          animation: none !important;
        }
      }
    `}</style>
  )
}
