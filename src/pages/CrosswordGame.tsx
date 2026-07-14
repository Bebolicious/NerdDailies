import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, Grid3x3 } from 'lucide-react'
import { NeoCard } from '../components/ui/NeoCard'
import { NeoButton } from '../components/ui/NeoButton'
import { InfoButton } from '../components/ui/InfoButton'
import { GuestBanner } from '../components/ui/GuestBanner'
import { ScreenEffects } from '../components/ui/ScreenEffects'
import { useCrosswordPuzzle } from '../hooks/usePuzzle'
import { useCrosswordState } from '../hooks/useCrosswordState'
import type { CheckScope } from '../hooks/useCrosswordState'
import type { Direction, WordSlot } from '../lib/crossword'
import { todayISO, weekStartISO } from '../lib/dates'
import type { CrosswordClue, CrosswordPuzzle } from '../lib/types'
import { cn } from '../lib/cn'

// Non-breaking-space sentinel kept in the hidden input so that Backspace on a
// mobile virtual keyboard always has a character to delete (and thus fires a
// reliable delete event). Invisible because the input is opacity-0.
const KEYBOARD_GUARD =' '

export function CrosswordGame() {
  // Weekly game — the result/session key is the Monday of the current week so
  // any visit Mon–Sun resolves to the same puzzle (mirrors the other weeklies).
  const week = weekStartISO(todayISO())
  const puzzle = useCrosswordPuzzle(week)
  if (!puzzle) return <div className="text-sm text-ink-soft">Loading puzzle…</div>
  return <CrosswordInner key={puzzle.id} puzzle={puzzle} week={week} />
}

function CrosswordInner({
  puzzle,
  week,
}: {
  puzzle: CrosswordPuzzle
  week: string
}) {
  const state = useCrosswordState({ date: week, puzzle })
  const {
    layout,
    values,
    cursor,
    direction,
    currentSlot,
    checkMarks,
    lockedCells,
    status,
    modal,
    closeModal,
    selectCell,
    selectClue,
    handleKeyDown,
    setCellLetter,
    backspace,
    check,
    reveal,
  } = state

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const refocusInput = () => inputRef.current?.focus()

  const acrossClueMap = useMemo(
    () => byNumber(puzzle.clues_across),
    [puzzle.clues_across],
  )
  const downClueMap = useMemo(
    () => byNumber(puzzle.clues_down),
    [puzzle.clues_down],
  )

  const activeClueText =
    currentSlot &&
    (currentSlot.direction === 'across'
      ? acrossClueMap.get(currentSlot.number)
      : downClueMap.get(currentSlot.number))

  return (
    <div>
      <ScreenEffects
        type={puzzle.effectType}
        emoji={puzzle.effectEmoji}
        color={puzzle.effectColor}
        active={status !== 'playing'}
      />
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wider leading-none">
              Mini Crossword
            </h1>
            <div className="text-xs text-ink-soft mt-1">
              Fill the grid. Use the sidebar to switch clues.
            </div>
          </div>
          {(puzzle.bannerText || puzzle.submitter) && status !== 'playing' && (
            <GuestBanner
              gameType="crossword"
              submitter={puzzle.submitter}
              text={puzzle.bannerText}
              color={puzzle.bannerColor}
              textColor={puzzle.bannerTextColor}
              style={puzzle.bannerStyle}
              variant="inline"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <CheckRevealMenu
            label="Check"
            icon={Check}
            onPick={(s) => {
              check(s)
              refocusInput()
            }}
          />
          <CheckRevealMenu
            label="Reveal"
            icon={Eye}
            onPick={(s) => {
              if (
                s !== 'square' &&
                !window.confirm(
                  s === 'word'
                    ? 'Reveal the entire active word? You can still keep playing.'
                    : 'Reveal the whole puzzle? This will finish the game.',
                )
              ) {
                refocusInput()
                return
              }
              reveal(s)
              refocusInput()
            }}
          />
          <InfoButton
            title="Mini Crossword"
            text="Fill every white square. Click a clue or a cell to start. Click a selected cell to swap between across and down. Tab/Enter jump to the next clue. Use Check or Reveal to inspect a square, the active word, or the whole puzzle."
          />
        </div>
      </div>

      {/* Active clue banner */}
      <NeoCard tone="mustard" shadow="sm" className="px-4 py-2 mb-3">
        <div className="flex items-center gap-3 text-sm">
          {currentSlot ? (
            <>
              <span className="font-display text-xs uppercase tracking-wider font-bold">
                {currentSlot.number}
                {currentSlot.direction === 'across' ? ' Across' : ' Down'}
              </span>
              <span className="font-bold flex-1 truncate">
                {activeClueText ?? <em className="opacity-60">(no clue)</em>}
              </span>
            </>
          ) : (
            <span className="opacity-60 italic">Tap a cell or clue to start.</span>
          )}
        </div>
      </NeoCard>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
        {/* Grid panel */}
        <div className="relative">
          {/* Hidden input — receives all keystrokes. Always-focused while
              playing so the on-screen keyboard pops on mobile.

              Desktop typing comes through `onKeyDown` (which calls
              preventDefault, suppressing the input event). Mobile virtual
              keyboards fire keydown with key="Unidentified", so the real
              character arrives via `onInput` instead. The non-empty sentinel
              value (GUARD) ensures Backspace always has something to delete so
              the delete event reliably fires on Android. The input must have a
              real (1px) size and not be display:none so iOS opens the
              keyboard on focus. */}
          <input
            ref={inputRef}
            type="text"
            className="absolute top-0 left-0 w-px h-px opacity-0 pointer-events-none"
            value={KEYBOARD_GUARD}
            onChange={() => {}}
            onInput={(e) => {
              const native = e.nativeEvent as InputEvent
              const type = native.inputType ?? ''
              if (type.startsWith('delete')) {
                backspace()
              } else if (native.data) {
                // Swipe/autocomplete can deliver multiple chars; feed each
                // through setCellLetter, which ignores non-letters.
                for (const ch of native.data) setCellLetter(ch)
              }
            }}
            onKeyDown={(e) => {
              handleKeyDown({
                key: e.key,
                shiftKey: e.shiftKey,
                preventDefault: () => e.preventDefault(),
              })
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            disabled={status !== 'playing'}
            aria-label="Crossword keyboard input"
          />

          <NeoCard tone="paper" shadow="md" className="p-3 inline-block w-full">
            <div
              className="grid mx-auto"
              style={{
                gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
                maxWidth: `min(100%, ${puzzle.size * 100}px)`,
              }}
            >
              {puzzle.solution.map((sol, i) => (
                <CellTile
                  key={i}
                  cellIndex={i}
                  solution={sol}
                  value={values[i] ?? ''}
                  number={layout.numbers[i]}
                  mark={checkMarks[i]}
                  locked={lockedCells[i]}
                  isCursor={cursor === i && status === 'playing'}
                  inActiveWord={
                    !!currentSlot && currentSlot.cells.includes(i) && status === 'playing'
                  }
                  onClick={() => {
                    if (status !== 'playing') return
                    selectCell(i)
                    refocusInput()
                  }}
                  size={puzzle.size}
                />
              ))}
            </div>
          </NeoCard>

          {status === 'solved' && (
            <NeoCard tone="lime" shadow="md" className="mt-4 p-4">
              <div className="flex items-center gap-3">
                <Grid3x3 className="h-5 w-5 shrink-0" />
                <div className="text-sm font-bold">
                  Solved! See you next week for the next mini.
                </div>
              </div>
            </NeoCard>
          )}
        </div>

        {/* Across clues */}
        <ClueList
          title="Across"
          slots={layout.acrossSlots}
          clueMap={acrossClueMap}
          currentSlot={currentSlot}
          currentDirection={direction}
          onPick={(slot) => {
            selectClue(slot)
            refocusInput()
          }}
          disabled={status !== 'playing'}
        />

        {/* Down clues */}
        <ClueList
          title="Down"
          slots={layout.downSlots}
          clueMap={downClueMap}
          currentSlot={currentSlot}
          currentDirection={direction}
          onPick={(slot) => {
            selectClue(slot)
            refocusInput()
          }}
          disabled={status !== 'playing'}
        />
      </div>

      {modal !== 'none' && (
        <ResultModal kind={modal} onClose={closeModal} />
      )}
    </div>
  )
}

function CellTile({
  cellIndex,
  solution,
  value,
  number,
  mark,
  locked,
  isCursor,
  inActiveWord,
  onClick,
  size,
}: {
  cellIndex: number
  solution: string | null
  value: string
  number: number | null
  mark: 'correct' | 'wrong' | null
  locked: boolean
  isCursor: boolean
  inActiveWord: boolean
  onClick: () => void
  size: number
}) {
  if (solution === null) {
    // Block — non-interactive dark square.
    return (
      <div
        className="aspect-square bg-emphasis border-neo-2"
        aria-hidden
        key={cellIndex}
      />
    )
  }

  const bg = isCursor
    ? 'bg-pink text-ink-static'
    : inActiveWord
      ? 'bg-mustard text-ink-static'
      : 'bg-paper'

  const ring =
    mark === 'correct'
      ? 'inset 0 0 0 3px var(--color-lime-deep)'
      : mark === 'wrong'
        ? 'inset 0 0 0 3px var(--color-coral-deep)'
        : undefined

  const fontSize =
    size <= 5 ? 'text-2xl' : size <= 6 ? 'text-xl' : 'text-lg'

  return (
    <button
      type="button"
      onClick={onClick}
      style={ring ? { boxShadow: ring } : undefined}
      className={cn(
        'relative aspect-square border-neo-2 flex items-center justify-center font-display font-bold uppercase select-none cursor-pointer transition-colors',
        bg,
        fontSize,
      )}
      aria-label={`Cell ${cellIndex}${value ? ' contains ' + value : ' empty'}`}
    >
      {number !== null && (
        <span
          className={cn(
            'absolute top-0.5 left-1 text-[10px] font-display font-bold leading-none pointer-events-none',
            isCursor ? 'text-ink-static' : 'text-ink-soft',
          )}
        >
          {number}
        </span>
      )}
      <span className={cn('leading-none', locked && !isCursor && 'opacity-90')}>
        {value}
      </span>
    </button>
  )
}

function ClueList({
  title,
  slots,
  clueMap,
  currentSlot,
  currentDirection,
  onPick,
  disabled,
}: {
  title: string
  slots: WordSlot[]
  clueMap: Map<number, string>
  currentSlot: WordSlot | null
  currentDirection: Direction
  onPick: (slot: WordSlot) => void
  disabled: boolean
}) {
  return (
    <NeoCard tone="paper" shadow="sm" className="p-3">
      <div className="font-display text-xs uppercase tracking-wider font-bold mb-2">
        {title}
      </div>
      <ul className="flex flex-col gap-1">
        {slots.map((slot) => {
          const isActive =
            currentSlot?.number === slot.number &&
            currentSlot.direction === slot.direction &&
            currentDirection === slot.direction
          return (
            <li key={`${slot.direction}-${slot.number}`}>
              <button
                type="button"
                onClick={() => onPick(slot)}
                disabled={disabled}
                className={cn(
                  'w-full text-left flex items-start gap-2 px-2 py-1.5 border-neo-2 text-xs transition-colors',
                  isActive
                    ? 'bg-mustard text-ink-static font-bold'
                    : 'bg-cream-soft hover:bg-paper',
                  disabled && 'opacity-60 cursor-default hover:bg-cream-soft',
                )}
              >
                <span className="font-display font-bold shrink-0 w-6">
                  {slot.number}
                </span>
                <span className="flex-1">
                  {clueMap.get(slot.number) ?? (
                    <em className="opacity-60">(no clue)</em>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </NeoCard>
  )
}

function CheckRevealMenu({
  label,
  icon: Icon,
  onPick,
}: {
  label: string
  icon: typeof Check
  onPick: (scope: CheckScope) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <NeoButton
        tone="paper"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon className="inline h-3 w-3 mr-1" />
        {label}
      </NeoButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] w-36 border-neo bg-paper shadow-neo-lg z-30"
        >
          <MenuRow
            onClick={() => {
              onPick('square')
              setOpen(false)
            }}
            label="Square"
          />
          <MenuRow
            onClick={() => {
              onPick('word')
              setOpen(false)
            }}
            label="Word"
          />
          <MenuRow
            onClick={() => {
              onPick('puzzle')
              setOpen(false)
            }}
            label="Puzzle"
          />
        </div>
      )}
    </div>
  )
}

function MenuRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className="w-full text-left px-3 py-2 text-xs font-display uppercase tracking-wider font-bold hover:bg-mustard hover:text-ink-static border-b-2 border-stroke last:border-b-0"
    >
      {label}
    </button>
  )
}

function ResultModal({
  kind,
  onClose,
}: {
  kind: 'won' | 'notQuiteYet'
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-emphasis/60" onClick={onClose} />
      <NeoCard
        tone={kind === 'won' ? 'lime' : 'coral'}
        shadow="lg"
        className="relative max-w-sm w-full p-6"
      >
        <div className="font-display text-3xl font-bold uppercase tracking-wider mb-2">
          {kind === 'won' ? '★ Congratulations!' : 'Not quite…'}
        </div>
        <div className="text-sm mb-4">
          {kind === 'won'
            ? "You solved this week's mini. The grid will stay solved on this device."
            : 'One or more squares are wrong. Use Check to find them, then keep going.'}
        </div>
        <div className="flex justify-end">
          <NeoButton
            tone={kind === 'won' ? 'ink' : 'paper'}
            size="sm"
            onClick={onClose}
          >
            {kind === 'won' ? 'Nice' : 'Close'}
          </NeoButton>
        </div>
      </NeoCard>
    </div>
  )
}

function byNumber(clues: CrosswordClue[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const c of clues) m.set(c.number, c.text)
  return m
}
