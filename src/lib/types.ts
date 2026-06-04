export type GameType =
  | 'screenshot'
  | 'trophy'
  | 'soundtrack'
  | 'blur'
  | 'archive'
  | 'crossword'

export type IgdbGame = {
  id: number
  name: string
  year?: number
  genre?: string
  platforms?: string[]
  cover_url?: string
}

export type ScreenshotPuzzle = {
  id: string
  puzzle_date: string
  game: IgdbGame
  image_urls: string[] // ordered, easiest last
  cover_url?: string
}

export type TrophyPuzzle = {
  id: string
  puzzle_date: string
  game: IgdbGame
  trophy_name: string
  trophy_description: string
  clues: string[] // up to 4
  rarity_pct?: number
  platform?: string
  gamerscore?: number
}

export type BlurPuzzle = {
  id: string
  puzzle_date: string
  game: IgdbGame
  cover_url: string // official game cover (portrait 3:4)
}

// How blurred the image is per wrong-guess step. Index 0 = before any wrong
// guess, last = after the final wrong guess (image fully clear). 6 steps.
export const BLUR_LEVELS_PX: number[] = [40, 28, 18, 10, 4, 0]

export type SoundtrackPuzzle = {
  id: string
  puzzle_date: string
  game: IgdbGame
  audio_url: string
  track_title?: string
  reveal_start_seconds: number // start of the unlock window
}

// Fixed schedule of how many seconds become playable per wrong-guess step.
// index 0 = before any guess, index 5 = after 5 wrong guesses.
export const SOUNDTRACK_UNLOCK_SECONDS: (number | 'ALL')[] = [
  1,
  4,
  8,
  15,
  30,
  'ALL',
]

export type Guess =
  | { kind: 'skip'; at: number }
  | { kind: 'wrong'; game: IgdbGame; at: number }
  | { kind: 'correct'; game: IgdbGame; at: number }

// ── ARCHIVE (weekly) ────────────────────────────────────────────────────────
//
// A larger, slower puzzle that drops once a week (Monday). Players have 5
// candles and 3 wrong-guess attempts to ID a mystery game by spending candles
// on clue objects in an atmospheric "archive room".

export type ArchiveMysteryBoxOutcome = 'jackpot' | 'clue' | 'redHerring' | 'lore'

export type ArchiveMysteryBox = {
  type: ArchiveMysteryBoxOutcome
  text: string
  game?: string // for redHerring: name of the unrelated game (flavor)
}

export type ArchivePuzzle = {
  id: string
  puzzle_week: string // ISO date of the Monday this puzzle runs

  game: IgdbGame
  weekly_theme?: string

  // Standard text clues (3 shelf boxes + 3 filing-cabinet drawers).
  clue_year: string
  clue_genre: string
  clue_platform: string
  clue_pitch: string
  clue_memo: string
  clue_review: string

  // Audio (radio). Optional — silent if missing.
  audio_url?: string

  // Wall frames — gameplay + key art. Required so the sharpen mechanic has
  // something to land on.
  frame1_url: string
  frame2_url: string

  // Sealed chest — cropped partial of the official title logo.
  chest_logo_url: string

  // Mystery boxes + trash. Boxes are hidden until found; trash always visible.
  mystery_a: ArchiveMysteryBox
  mystery_b: ArchiveMysteryBox
  trash_crossed_out: string // a plausible but wrong title
}

// Visual blur level for the two wall frames, indexed by how many wrong guesses
// have happened (0..3). 5 conceptual blur levels collapse to 4 reveal steps
// since the game ends on the 3rd wrong guess.
export const ARCHIVE_FRAME_BLUR_PX: number[] = [40, 24, 12, 0]

export const ARCHIVE_TOTAL_CANDLES = 5
export const ARCHIVE_MAX_WRONG = 3

// Cost in candles per object type.
export const ARCHIVE_COSTS = {
  shelfBox: 1,
  cabinetDrawer: 1,
  radio: 1,
  frame: 1,
  mysteryBox: 1,
  chest: 2,
  trash: 0,
} as const

// ── CROSSWORD (daily) ───────────────────────────────────────────────────────
//
// A mini crossword. The solution is a flat row-major array of length size*size;
// each cell is either a single uppercase letter or `null` (a block / hidden
// square). Numbering, word slots and across/down lookups are derived from the
// solution at render time — `clues` only stores the visible text keyed by the
// auto-assigned number.

export const CROSSWORD_MIN_SIZE = 4
export const CROSSWORD_MAX_SIZE = 8
export const CROSSWORD_MIN_WORD_LENGTH = 2

export type CrosswordClue = {
  number: number
  text: string
}

export type CrosswordPuzzle = {
  id: string
  puzzle_date: string
  size: number
  solution: (string | null)[] // length = size * size
  clues_across: CrosswordClue[]
  clues_down: CrosswordClue[]
}

export type PuzzleResult = {
  date: string
  gameType: GameType
  status: 'solved' | 'lost'
  guessCount: number
  guesses: Guess[]
  startedAt: number
  finishedAt: number
}
