// Pure helpers for crossword geometry: numbering, word slots, lookups.
// No React, no hooks — these are called from both the player hook and the
// admin editor's live preview.

export type Direction = 'across' | 'down'

export type WordSlot = {
  number: number
  direction: Direction
  startIndex: number
  length: number
  cells: number[] // ordered cell indices that belong to this word
}

export type CrosswordLayout = {
  size: number
  // Per-cell number if the cell starts a word; null otherwise (or block).
  numbers: (number | null)[]
  acrossSlots: WordSlot[]
  downSlots: WordSlot[]
  // cellIndex -> slot containing it (or null if cell is a block or
  // belongs to no across/down word in that direction).
  acrossByCell: (WordSlot | null)[]
  downByCell: (WordSlot | null)[]
}

export function idx(row: number, col: number, size: number): number {
  return row * size + col
}

export function rowOf(i: number, size: number): number {
  return Math.floor(i / size)
}

export function colOf(i: number, size: number): number {
  return i % size
}

export function isBlock(solution: (string | null)[], i: number): boolean {
  return solution[i] === null
}

function startsAcross(
  solution: (string | null)[],
  size: number,
  r: number,
  c: number,
): boolean {
  if (solution[idx(r, c, size)] === null) return false
  const leftIsEdgeOrBlock = c === 0 || solution[idx(r, c - 1, size)] === null
  const rightIsLetter =
    c < size - 1 && solution[idx(r, c + 1, size)] !== null
  return leftIsEdgeOrBlock && rightIsLetter
}

function startsDown(
  solution: (string | null)[],
  size: number,
  r: number,
  c: number,
): boolean {
  if (solution[idx(r, c, size)] === null) return false
  const topIsEdgeOrBlock = r === 0 || solution[idx(r - 1, c, size)] === null
  const bottomIsLetter =
    r < size - 1 && solution[idx(r + 1, c, size)] !== null
  return topIsEdgeOrBlock && bottomIsLetter
}

export function computeLayout(
  solution: (string | null)[],
  size: number,
): CrosswordLayout {
  const numbers: (number | null)[] = new Array(size * size).fill(null)
  const acrossSlots: WordSlot[] = []
  const downSlots: WordSlot[] = []
  const acrossByCell: (WordSlot | null)[] = new Array(size * size).fill(null)
  const downByCell: (WordSlot | null)[] = new Array(size * size).fill(null)

  let next = 1
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = idx(r, c, size)
      const sA = startsAcross(solution, size, r, c)
      const sD = startsDown(solution, size, r, c)
      if (!sA && !sD) continue
      const number = next++
      numbers[i] = number

      if (sA) {
        const cells: number[] = []
        let cc = c
        while (cc < size && solution[idx(r, cc, size)] !== null) {
          cells.push(idx(r, cc, size))
          cc++
        }
        const slot: WordSlot = {
          number,
          direction: 'across',
          startIndex: i,
          length: cells.length,
          cells,
        }
        acrossSlots.push(slot)
        for (const cell of cells) acrossByCell[cell] = slot
      }
      if (sD) {
        const cells: number[] = []
        let rr = r
        while (rr < size && solution[idx(rr, c, size)] !== null) {
          cells.push(idx(rr, c, size))
          rr++
        }
        const slot: WordSlot = {
          number,
          direction: 'down',
          startIndex: i,
          length: cells.length,
          cells,
        }
        downSlots.push(slot)
        for (const cell of cells) downByCell[cell] = slot
      }
    }
  }

  return {
    size,
    numbers,
    acrossSlots,
    downSlots,
    acrossByCell,
    downByCell,
  }
}

export function slotForCell(
  layout: CrosswordLayout,
  cell: number,
  direction: Direction,
): WordSlot | null {
  return direction === 'across'
    ? layout.acrossByCell[cell]
    : layout.downByCell[cell]
}

// Find the first empty cell within `slot`, or null if all filled.
export function firstEmptyInSlot(
  slot: WordSlot,
  values: string[],
): number | null {
  for (const c of slot.cells) {
    if (!values[c]) return c
  }
  return null
}

// True if every cell in the slot has a value.
export function slotIsFilled(slot: WordSlot, values: string[]): boolean {
  return slot.cells.every((c) => !!values[c])
}

// True if every cell in the slot matches the solution.
export function slotIsAllCorrect(
  slot: WordSlot,
  values: string[],
  solution: (string | null)[],
): boolean {
  return slot.cells.every((c) => {
    const sol = solution[c]
    if (sol === null) return false
    return values[c] === sol
  })
}

// Step from `cell` one position in `direction`. Returns null if we would
// step off the grid or into a block.
export function stepCell(
  layout: CrosswordLayout,
  solution: (string | null)[],
  cell: number,
  direction: Direction,
  forward: boolean,
): number | null {
  const r = rowOf(cell, layout.size)
  const c = colOf(cell, layout.size)
  const nr = direction === 'down' ? r + (forward ? 1 : -1) : r
  const nc = direction === 'across' ? c + (forward ? 1 : -1) : c
  if (nr < 0 || nr >= layout.size || nc < 0 || nc >= layout.size) return null
  const ni = idx(nr, nc, layout.size)
  if (solution[ni] === null) return null
  return ni
}

// Returns the next slot in the same direction after `currentNumber`. If
// no later slot, wraps to the other direction's first slot. If we've
// already exhausted both, wraps to the start.
export function nextSlot(
  layout: CrosswordLayout,
  current: WordSlot,
): WordSlot {
  const same = current.direction === 'across' ? layout.acrossSlots : layout.downSlots
  const other = current.direction === 'across' ? layout.downSlots : layout.acrossSlots
  const i = same.findIndex((s) => s.number === current.number)
  if (i >= 0 && i < same.length - 1) return same[i + 1]
  // Wrap to the other direction, then to the start.
  if (other.length > 0) return other[0]
  return same[0]
}

export function prevSlot(
  layout: CrosswordLayout,
  current: WordSlot,
): WordSlot {
  const same = current.direction === 'across' ? layout.acrossSlots : layout.downSlots
  const other = current.direction === 'across' ? layout.downSlots : layout.acrossSlots
  const i = same.findIndex((s) => s.number === current.number)
  if (i > 0) return same[i - 1]
  if (other.length > 0) return other[other.length - 1]
  return same[same.length - 1]
}

// First non-block cell in row-major order. Used as the initial cursor.
export function firstLetterCell(solution: (string | null)[]): number {
  for (let i = 0; i < solution.length; i++) {
    if (solution[i] !== null) return i
  }
  return 0
}
