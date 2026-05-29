import { useCallback, useMemo, useState } from 'react'
import {
  computeLayout,
  firstEmptyInSlot,
  firstLetterCell,
  isBlock,
  slotForCell,
  slotIsAllCorrect,
  stepCell,
  nextSlot,
  prevSlot,
} from '../lib/crossword'
import type { Direction, WordSlot } from '../lib/crossword'
import { getResult, saveResult } from '../lib/scoreStore'
import type { CrosswordPuzzle, PuzzleResult } from '../lib/types'

type ModalState = 'none' | 'won' | 'notQuiteYet'
type CheckMark = 'correct' | 'wrong' | null
export type CheckScope = 'square' | 'word' | 'puzzle'

type Args = {
  date: string
  puzzle: CrosswordPuzzle
}

export function useCrosswordState({ date, puzzle }: Args) {
  const layout = useMemo(
    () => computeLayout(puzzle.solution, puzzle.size),
    [puzzle.size, puzzle.solution],
  )

  const existing = useMemo(() => getResult(date, 'crossword'), [date])
  const wasAlreadySolved = existing?.status === 'solved'

  const [startedAt] = useState<number>(
    () => existing?.startedAt ?? Date.now(),
  )

  // Initial state varies by whether the player previously solved this puzzle.
  const initialValues = useMemo<string[]>(
    () =>
      wasAlreadySolved
        ? puzzle.solution.map((s) => s ?? '')
        : new Array(puzzle.solution.length).fill(''),
    [wasAlreadySolved, puzzle.solution],
  )
  const initialLocked = useMemo<boolean[]>(
    () =>
      wasAlreadySolved
        ? puzzle.solution.map((s) => s !== null)
        : new Array(puzzle.solution.length).fill(false),
    [wasAlreadySolved, puzzle.solution],
  )
  const initialMarks = useMemo<CheckMark[]>(
    () =>
      wasAlreadySolved
        ? puzzle.solution.map((s) => (s !== null ? 'correct' : null))
        : new Array(puzzle.solution.length).fill(null),
    [wasAlreadySolved, puzzle.solution],
  )
  const initialCursor = useMemo(
    () => firstLetterCell(puzzle.solution),
    [puzzle.solution],
  )
  const initialDirection = useMemo<Direction>(
    () => (layout.acrossByCell[initialCursor] ? 'across' : 'down'),
    [layout, initialCursor],
  )

  const [values, setValues] = useState<string[]>(initialValues)
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const [cursor, setCursor] = useState<number>(initialCursor)
  const [checkMarks, setCheckMarks] = useState<CheckMark[]>(initialMarks)
  const [lockedCells, setLockedCells] = useState<boolean[]>(initialLocked)
  const [status, setStatus] = useState<'playing' | 'solved'>(
    wasAlreadySolved ? 'solved' : 'playing',
  )
  const [modal, setModal] = useState<ModalState>('none')

  // The "current word" prefers the chosen direction, but falls back to the
  // perpendicular if no slot exists there (e.g. cursor is in a cell that
  // only participates in one direction).
  const currentSlot: WordSlot | null = useMemo(() => {
    return (
      slotForCell(layout, cursor, direction) ??
      slotForCell(layout, cursor, otherDir(direction))
    )
  }, [layout, cursor, direction])

  const effectiveDirection: Direction = currentSlot?.direction ?? direction

  // ── Finalize ──────────────────────────────────────────────────────────────

  const finalizeSolved = useCallback(() => {
    setStatus('solved')
    setLockedCells(puzzle.solution.map((s) => s !== null))
    setCheckMarks(puzzle.solution.map((s) => (s !== null ? 'correct' : null)))
    const result: PuzzleResult = {
      date,
      gameType: 'crossword',
      status: 'solved',
      guessCount: 0,
      guesses: [],
      startedAt,
      finishedAt: Date.now(),
    }
    saveResult(result)
    window.dispatchEvent(new Event('dailies:result-saved'))
    setModal('won')
  }, [date, puzzle.solution, startedAt])

  // After each cell write, check whether the grid is now completely filled.
  // If yes, pop the appropriate modal (and on full-correct, finalize).
  const maybeCompleteCheck = useCallback(
    (nextValues: string[]) => {
      const allFilled = puzzle.solution.every(
        (s, i) => s === null || !!nextValues[i],
      )
      if (!allFilled) return
      const allCorrect = puzzle.solution.every(
        (s, i) => s === null || nextValues[i] === s,
      )
      if (allCorrect) {
        // Defer to next tick so the just-typed letter renders before the modal.
        queueMicrotask(finalizeSolved)
      } else {
        setModal('notQuiteYet')
      }
    },
    [puzzle.solution, finalizeSolved],
  )

  // ── Cursor / direction ────────────────────────────────────────────────────

  // Jump cursor to a specific cell. If the cell is in a slot for the current
  // preferred direction, keep direction; otherwise fall back to the other.
  const focusCell = useCallback(
    (cell: number, preferred?: Direction) => {
      if (isBlock(puzzle.solution, cell)) return
      const want = preferred ?? direction
      const targetDir: Direction = slotForCell(layout, cell, want)
        ? want
        : slotForCell(layout, cell, otherDir(want))
          ? otherDir(want)
          : want
      setCursor(cell)
      setDirection(targetDir)
    },
    [direction, layout, puzzle.solution],
  )

  const selectCell = useCallback(
    (cell: number) => {
      if (isBlock(puzzle.solution, cell)) return
      // Clicking the already-selected cell toggles direction (only if both
      // directions are valid at that cell).
      if (cell === cursor) {
        const otherDirSlot = slotForCell(layout, cell, otherDir(direction))
        if (otherDirSlot) setDirection(otherDir(direction))
        return
      }
      focusCell(cell)
    },
    [cursor, direction, focusCell, layout, puzzle.solution],
  )

  const selectClue = useCallback(
    (slot: WordSlot) => {
      const first = firstEmptyInSlot(slot, values) ?? slot.cells[0]
      setDirection(slot.direction)
      setCursor(first)
    },
    [values],
  )

  const moveToSlot = useCallback(
    (slot: WordSlot) => {
      const first = firstEmptyInSlot(slot, values) ?? slot.cells[0]
      setDirection(slot.direction)
      setCursor(first)
    },
    [values],
  )

  // ── Mutations ─────────────────────────────────────────────────────────────

  // Writes a letter at `cell` (or clears it when letter==='') if the cell
  // isn't locked. Always clears the cell's check-mark on any write attempt.
  const writeCell = useCallback(
    (cell: number, letter: string) => {
      if (lockedCells[cell]) return false
      const next = values.slice()
      next[cell] = letter
      setValues(next)
      if (checkMarks[cell] !== null) {
        const m = checkMarks.slice()
        m[cell] = null
        setCheckMarks(m)
      }
      maybeCompleteCheck(next)
      return true
    },
    [values, checkMarks, lockedCells, maybeCompleteCheck],
  )

  const setCellLetter = useCallback(
    (letter: string) => {
      if (status !== 'playing') return
      const upper = letter.toUpperCase()
      if (!/^[A-Z]$/.test(upper)) return
      if (!writeCell(cursor, upper)) return
      // Auto-advance: prefer the next empty cell in the current slot; if the
      // word is now full, jump to the next slot's first empty.
      const slot = currentSlot
      if (!slot) return
      const nextValues = values.slice()
      nextValues[cursor] = upper
      // Find next empty cell in the slot, starting AFTER cursor.
      const idxInSlot = slot.cells.indexOf(cursor)
      let nextEmpty: number | null = null
      for (let i = idxInSlot + 1; i < slot.cells.length; i++) {
        if (!nextValues[slot.cells[i]]) {
          nextEmpty = slot.cells[i]
          break
        }
      }
      if (nextEmpty !== null) {
        setCursor(nextEmpty)
        return
      }
      // No empty cell after cursor. If any cell in the slot is still empty
      // (gap before cursor), jump to the first empty in the slot.
      const firstEmpty = firstEmptyInSlot(slot, nextValues)
      if (firstEmpty !== null) {
        setCursor(firstEmpty)
        return
      }
      // Slot fully filled — move to next slot's first empty cell.
      const ns = nextSlot(layout, slot)
      const target = firstEmptyInSlot(ns, nextValues) ?? ns.cells[0]
      setDirection(ns.direction)
      setCursor(target)
    },
    [cursor, currentSlot, layout, status, values, writeCell],
  )

  const backspace = useCallback(() => {
    if (status !== 'playing') return
    if (lockedCells[cursor]) {
      // Locked cell — try to step back to an editable cell.
      const slot = currentSlot
      if (!slot) return
      const i = slot.cells.indexOf(cursor)
      for (let j = i - 1; j >= 0; j--) {
        if (!lockedCells[slot.cells[j]]) {
          setCursor(slot.cells[j])
          return
        }
      }
      return
    }
    if (values[cursor]) {
      // Filled cell: delete in place, do not move.
      writeCell(cursor, '')
      return
    }
    // Empty cell: step back within the slot to the previous cell, delete it.
    const slot = currentSlot
    if (!slot) return
    const i = slot.cells.indexOf(cursor)
    for (let j = i - 1; j >= 0; j--) {
      const prev = slot.cells[j]
      if (lockedCells[prev]) continue
      setCursor(prev)
      writeCell(prev, '')
      return
    }
  }, [cursor, currentSlot, lockedCells, status, values, writeCell])

  // Arrow key behavior: if the keypress is perpendicular to the current
  // direction AND the cell has a slot in that other direction, just switch
  // direction without moving. Otherwise step one cell.
  const arrow = useCallback(
    (key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
      const want: Direction =
        key === 'ArrowLeft' || key === 'ArrowRight' ? 'across' : 'down'
      const forward = key === 'ArrowRight' || key === 'ArrowDown'
      if (want !== effectiveDirection) {
        // Perpendicular — switch direction first (only if other slot exists).
        const perpSlot = slotForCell(layout, cursor, want)
        if (perpSlot) {
          setDirection(want)
          return
        }
        // No perp slot; still try to step along the current dir if possible.
      }
      // Step once in the requested direction (NYT behavior: one keypress =
      // one cell of movement). stepCell returns null if the next position
      // would be off the grid or onto a block, so the cursor just stays put.
      const next = stepCell(layout, puzzle.solution, cursor, want, forward)
      if (next !== null) setCursor(next)
    },
    [cursor, effectiveDirection, layout, puzzle.solution],
  )

  const jumpNextSlot = useCallback(() => {
    const slot = currentSlot
    if (!slot) return
    const ns = nextSlot(layout, slot)
    moveToSlot(ns)
  }, [currentSlot, layout, moveToSlot])

  const jumpPrevSlot = useCallback(() => {
    const slot = currentSlot
    if (!slot) return
    const ps = prevSlot(layout, slot)
    moveToSlot(ps)
  }, [currentSlot, layout, moveToSlot])

  const toggleDirection = useCallback(() => {
    const other = otherDir(direction)
    if (slotForCell(layout, cursor, other)) setDirection(other)
  }, [cursor, direction, layout])

  const handleKeyDown = useCallback(
    (e: { key: string; shiftKey?: boolean; preventDefault?: () => void }) => {
      if (status !== 'playing') return
      const k = e.key
      if (k === 'Backspace') {
        e.preventDefault?.()
        backspace()
        return
      }
      if (k === 'Tab') {
        e.preventDefault?.()
        if (e.shiftKey) jumpPrevSlot()
        else jumpNextSlot()
        return
      }
      if (k === 'Enter') {
        e.preventDefault?.()
        jumpNextSlot()
        return
      }
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault?.()
        toggleDirection()
        return
      }
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault?.()
        arrow(k)
        return
      }
      if (k.length === 1 && /^[a-zA-Z]$/.test(k)) {
        e.preventDefault?.()
        setCellLetter(k)
      }
    },
    [arrow, backspace, jumpNextSlot, jumpPrevSlot, setCellLetter, status, toggleDirection],
  )

  // ── Check ─────────────────────────────────────────────────────────────────

  const lockSlotIfAllCorrect = useCallback(
    (slot: WordSlot, vals: string[], marks: CheckMark[], locks: boolean[]) => {
      if (slotIsAllCorrect(slot, vals, puzzle.solution)) {
        for (const c of slot.cells) {
          marks[c] = 'correct'
          locks[c] = true
        }
      }
    },
    [puzzle.solution],
  )

  const check = useCallback(
    (scope: CheckScope) => {
      const nextMarks = checkMarks.slice()
      const nextLocks = lockedCells.slice()

      const markCell = (cell: number) => {
        if (isBlock(puzzle.solution, cell)) return
        if (!values[cell]) return // skip empty cells silently
        nextMarks[cell] = values[cell] === puzzle.solution[cell] ? 'correct' : 'wrong'
      }

      if (scope === 'square') {
        markCell(cursor)
      } else if (scope === 'word') {
        const slot = currentSlot
        if (slot) {
          for (const c of slot.cells) markCell(c)
          lockSlotIfAllCorrect(slot, values, nextMarks, nextLocks)
        }
      } else {
        // puzzle
        for (let c = 0; c < puzzle.solution.length; c++) markCell(c)
        // Lock every fully-correct word.
        for (const s of layout.acrossSlots) lockSlotIfAllCorrect(s, values, nextMarks, nextLocks)
        for (const s of layout.downSlots) lockSlotIfAllCorrect(s, values, nextMarks, nextLocks)
        // If the whole puzzle is now full + correct, finalize.
        const allFilled = puzzle.solution.every((s, i) => s === null || !!values[i])
        if (allFilled && puzzle.solution.every((s, i) => s === null || values[i] === s)) {
          queueMicrotask(finalizeSolved)
          return
        }
      }
      setCheckMarks(nextMarks)
      setLockedCells(nextLocks)
    },
    [checkMarks, currentSlot, cursor, finalizeSolved, layout, lockSlotIfAllCorrect, lockedCells, puzzle.solution, values],
  )

  // ── Reveal ────────────────────────────────────────────────────────────────

  const reveal = useCallback(
    (scope: CheckScope) => {
      const nextValues = values.slice()
      const nextMarks = checkMarks.slice()
      const nextLocks = lockedCells.slice()

      const revealCell = (cell: number) => {
        const sol = puzzle.solution[cell]
        if (sol === null) return
        nextValues[cell] = sol
        nextMarks[cell] = 'correct'
        nextLocks[cell] = true
      }

      if (scope === 'square') {
        revealCell(cursor)
      } else if (scope === 'word') {
        const slot = currentSlot
        if (slot) for (const c of slot.cells) revealCell(c)
      } else {
        for (let c = 0; c < puzzle.solution.length; c++) revealCell(c)
      }

      setValues(nextValues)
      setCheckMarks(nextMarks)
      setLockedCells(nextLocks)
      maybeCompleteCheck(nextValues)
    },
    [checkMarks, currentSlot, cursor, lockedCells, maybeCompleteCheck, puzzle.solution, values],
  )

  const closeModal = useCallback(() => setModal('none'), [])

  return {
    // grid
    layout,
    values,
    cursor,
    direction: effectiveDirection,
    currentSlot,
    checkMarks,
    lockedCells,

    // status
    status,
    modal,
    closeModal,

    // input
    selectCell,
    selectClue,
    handleKeyDown,
    toggleDirection,
    jumpNextSlot,
    jumpPrevSlot,
    setCellLetter,
    backspace,

    // actions
    check,
    reveal,
  }
}

function otherDir(d: Direction): Direction {
  return d === 'across' ? 'down' : 'across'
}
