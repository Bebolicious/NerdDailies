export type GameType =
  | 'screenshot'
  | 'trophy'
  | 'soundtrack'
  | 'blur'
  | 'archive'
  | 'crossword'
  | 'higherlower'

export type Game = {
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
  game: Game
  image_urls: string[] // ordered, easiest last
  cover_url?: string
  submitter?: string // community contributor — surfaces a GUEST banner
}

export type TrophyPuzzle = {
  id: string
  puzzle_date: string
  game: Game
  trophy_name: string
  trophy_description: string
  clues: string[] // up to 4
  rarity_pct?: number
  platform?: string
  gamerscore?: number
  submitter?: string
}

export type BlurPuzzle = {
  id: string
  puzzle_date: string
  game: Game
  cover_url: string // official game cover (portrait 3:4)
  submitter?: string
}

// How blurred the image is per wrong-guess step. Index 0 = before any wrong
// guess, last = after the final wrong guess (image fully clear). 6 steps.
export const BLUR_LEVELS_PX: number[] = [40, 28, 18, 10, 4, 0]

export type SoundtrackPuzzle = {
  id: string
  puzzle_date: string
  game: Game
  audio_url: string
  track_title?: string
  reveal_start_seconds: number // start of the unlock window
  submitter?: string
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
  | { kind: 'wrong'; game: Game; at: number }
  | { kind: 'correct'; game: Game; at: number }

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

  game: Game
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

  submitter?: string
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
  submitter?: string
}

// ── HIGHER / LOWER (weekly gauntlet) ────────────────────────────────────────
//
// A fixed sequence of pre-authored pairs. Each pair shows two games and asks
// the player which side has the higher value for the chosen stat. The player
// always plays through all pairs — wrong picks are recorded but do not end the
// run. Score = correct count.

export const HIGHERLOWER_PAIR_COUNT = 15

export type HigherLowerCategory =
  | 'metacritic'
  | 'steam_rating'
  | 'copies_sold'
  | 'release_year'
  | 'speedrun_wr'
  | 'budget'
  | 'hltb_main'
  | 'hltb_completionist'

export type HigherLowerCategoryConfig = {
  id: HigherLowerCategory
  label: string // short badge shown above the pair
  question: string // the prompt: "Which has the higher Metacritic score?"
  unitHint: string // placeholder/help shown in the admin value field
  valueLabel: string // small label shown above the revealed value on the card
}

// Each category is "pick the side with the larger value". Speedrun + HLTB use
// raw seconds/hours, so "larger value" naturally means "longer run/playthrough"
// — the question text spells that out so players aren't surprised.
export const HIGHERLOWER_CATEGORIES: Record<
  HigherLowerCategory,
  HigherLowerCategoryConfig
> = {
  metacritic: {
    id: 'metacritic',
    label: 'Metacritic',
    question: 'Which has the higher Metacritic score?',
    unitHint: '0–100 — e.g. 92',
    valueLabel: 'Metacritic',
  },
  steam_rating: {
    id: 'steam_rating',
    label: 'Steam rating',
    question: 'Which has the higher Steam rating?',
    unitHint: '0–100 (%) — e.g. 96',
    valueLabel: 'Steam %',
  },
  copies_sold: {
    id: 'copies_sold',
    label: 'Copies sold',
    question: 'Which has sold more copies?',
    unitHint: 'in millions — e.g. 25.4',
    valueLabel: 'Copies sold',
  },
  release_year: {
    id: 'release_year',
    label: 'Release year',
    question: 'Which came out later?',
    unitHint: 'year — e.g. 2017',
    valueLabel: 'Released',
  },
  speedrun_wr: {
    id: 'speedrun_wr',
    label: 'Speedrun WR',
    question: 'Which has the longer any% speedrun world record?',
    unitHint: 'seconds — e.g. 1827 for 30:27',
    valueLabel: 'Any% WR',
  },
  budget: {
    id: 'budget',
    label: 'Dev budget',
    question: 'Which had the bigger development budget?',
    unitHint: 'in millions USD — e.g. 220',
    valueLabel: 'Budget',
  },
  hltb_main: {
    id: 'hltb_main',
    label: 'Main story',
    question: 'Which takes longer to beat (main story)?',
    unitHint: 'hours — e.g. 18.5',
    valueLabel: 'Main story',
  },
  hltb_completionist: {
    id: 'hltb_completionist',
    label: '100% completion',
    question: 'Which takes longer to 100% complete?',
    unitHint: 'hours — e.g. 72',
    valueLabel: '100%',
  },
}

export type HigherLowerSide = {
  game_id: number
  game_name: string
  game_year?: number
  cover_url?: string
  value: number // raw numeric — used for comparison
  display?: string // optional formatted override (e.g. "1:42:35", "$220M")
}

export type HigherLowerPair = {
  id: string
  position: number
  category: HigherLowerCategory
  a: HigherLowerSide
  b: HigherLowerSide
}

export type HigherLowerPuzzle = {
  id: string
  puzzle_week: string
  theme?: string
  pairs: HigherLowerPair[]
  submitter?: string
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
