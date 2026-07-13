export type GameType =
  | 'screenshot'
  | 'trophy'
  | 'soundtrack'
  | 'blur'
  | 'archive'
  | 'crossword'
  | 'higherlower'
  | 'connections'

export type Game = {
  id: number
  name: string
  year?: number
  genre?: string
  platforms?: string[]
  cover_url?: string
}

// ── Per-puzzle decoration (banner + page-wide screen effect) ─────────────────
//
// Every puzzle can carry an optional community-credit banner and, on finish, a
// full-viewport celebration effect. Stored per-puzzle (columns mirror the
// original `submitter` column on every `*_puzzles` table) and set in each
// admin editor. See `lib/decor.ts` for the row <-> object mapping and
// `components/ui/ScreenEffects.tsx` for rendering.

export type ScreenEffectType = 'falling' | 'rising' | 'confetti' | 'vignette'

export type PuzzleDecor = {
  submitter?: string // community contributor — surfaces a "Submitted by" banner
  bannerText?: string // custom banner label — OVERRIDES the submitter banner
  bannerColor?: string // hex; custom banner background (falls back to game tone)
  effectType?: ScreenEffectType
  effectEmoji?: string // e.g. "❤️" — the particle glyph
  effectColor?: string // hex; vignette / overlay color
}

export type ScreenshotPuzzle = {
  id: string
  puzzle_date: string
  game: Game
  image_urls: string[] // ordered, easiest last
  cover_url?: string
} & PuzzleDecor

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
  cover_url?: string // optional official cover, shown on the answer-reveal card
} & PuzzleDecor

export type BlurPuzzle = {
  id: string
  puzzle_date: string
  game: Game
  cover_url: string // official game cover (portrait 3:4)
} & PuzzleDecor

// How blurred the image is per wrong-guess step. Index 0 = before any wrong
// guess, last = at the final (5th) guess — still lightly blurred; the image
// only goes fully clear once the round finishes. 5 steps = 5 guesses.
export const BLUR_LEVELS_PX: number[] = [40, 28, 20, 14, 4]

export type SoundtrackPuzzle = {
  id: string
  puzzle_date: string
  game: Game
  audio_url: string
  track_title?: string
  reveal_start_seconds: number // start of the unlock window
  cover_url?: string // optional official cover, shown on the answer-reveal card
} & PuzzleDecor

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
} & PuzzleDecor

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

// ── CROSSWORD (weekly) ──────────────────────────────────────────────────────
//
// A mini crossword. The solution is a flat row-major array of length size*size;
// each cell is either a single uppercase letter or `null` (a block / hidden
// square). Numbering, word slots and across/down lookups are derived from the
// solution at render time — `clues` only stores the visible text keyed by the
// auto-assigned number.

export const CROSSWORD_MIN_SIZE = 4
export const CROSSWORD_MAX_SIZE = 13
export const CROSSWORD_MIN_WORD_LENGTH = 2

export type CrosswordClue = {
  number: number
  text: string
}

export type CrosswordPuzzle = {
  id: string
  puzzle_week: string // ISO date of the Monday this puzzle runs
  size: number
  solution: (string | null)[] // length = size * size
  clues_across: CrosswordClue[]
  clues_down: CrosswordClue[]
} & PuzzleDecor

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
  | 'steam_peak'
  | 'movie_adaptation'
  | 'steam_reviews'
  | 'twitch_peak'

// ── Pair types ───────────────────────────────────────────────────────────────
//
// Each pair in the gauntlet plays one of three ways:
//   'vs'        — the classic: two games, pick which side wins the stat.
//   'slider'    — one game; every player drags a slider to guess the exact
//                 value. Scored by how close they land (see higherlowerScoring).
//   'piggyback' — one game; hot-seat only. The lead-off player sets "the bar"
//                 (and can bluff); followers see it and choose to trust or
//                 diverge. Solo play skips it and banks it as correct.
export type HighLowPairType = 'vs' | 'slider' | 'piggyback'

// Slider/piggyback tuning for a single-value category. `bullseye` is the abs
// diff (>0) that still counts as a full-points "Bullseye!". `spread` is the
// raw-unit distance at which an off-guess decays to zero points — so the same
// scoring curve works whether the value is a 0–100 score, a year, or hours.
export type SliderConfig = {
  min: number
  max: number
  step: number
  bullseye: number
  spread: number
  unit?: string // small suffix on the slider bubble, e.g. 'h', '%', 'M'
}

export type HigherLowerCategoryConfig = {
  id: HigherLowerCategory
  label: string // short badge shown above the pair
  question: string // the prompt: "Which has the higher Metacritic score?"
  unitHint: string // placeholder/help shown in the admin value field
  valueLabel: string // small label shown above the revealed value on the card
  // When true, the SMALLER raw value wins instead of the larger one. Used by
  // "fastest"/"earliest" style categories (speedrun time, first movie year)
  // where a lower number is the better answer. The admin still stores the real
  // number (seconds, year); only the win direction flips.
  lowerWins?: boolean
  // Present only on categories that can also be played as 'slider' /
  // 'piggyback' pairs. Absent ⇒ the category is vs-only (the editor hides it
  // from the type dropdown for single-value pairs).
  slider?: SliderConfig
  // Full-sentence prompt for slider/piggyback rounds (e.g. "Guess how long it
  // takes to beat the main story"). Falls back to `Guess the <valueLabel>`.
  sliderQuestion?: string
}

// Default direction is "pick the side with the larger value". Categories that
// set `lowerWins: true` flip that (smaller wins) — the question text always
// spells out the direction so players aren't surprised.
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
    slider: { min: 0, max: 100, step: 1, bullseye: 1, spread: 100 },
    sliderQuestion: 'Guess the Metacritic score',
  },
  steam_rating: {
    id: 'steam_rating',
    label: 'Steam rating',
    question: 'Which has the higher Steam rating?',
    unitHint: '0–100 (%) — e.g. 96',
    valueLabel: 'Steam %',
    slider: { min: 0, max: 100, step: 1, bullseye: 1, spread: 100, unit: '%' },
    sliderQuestion: 'Guess the Steam rating (%)',
  },
  copies_sold: {
    id: 'copies_sold',
    label: 'Copies sold',
    question: 'Which has sold more copies?',
    unitHint: 'in millions — e.g. 25.4',
    valueLabel: 'Copies sold',
    slider: { min: 0, max: 60, step: 0.5, bullseye: 1, spread: 30, unit: 'M' },
    sliderQuestion: 'Guess how many copies it sold (millions)',
  },
  release_year: {
    id: 'release_year',
    label: 'Release year',
    question: 'Which came out later?',
    unitHint: 'year — e.g. 2017',
    valueLabel: 'Released',
    slider: { min: 1972, max: 2026, step: 1, bullseye: 1, spread: 20 },
    sliderQuestion: 'Guess the release year',
  },
  speedrun_wr: {
    id: 'speedrun_wr',
    label: 'Fastest Any%',
    question: 'Which has the FASTER any% speedrun world record?',
    unitHint: 'seconds — e.g. 1827 for 30:27 (lower = faster wins)',
    valueLabel: 'Any% WR',
    lowerWins: true,
  },
  budget: {
    id: 'budget',
    label: 'Dev budget',
    question: 'Which had the bigger development budget?',
    unitHint: 'in millions USD — e.g. 220',
    valueLabel: 'Budget',
    slider: { min: 0, max: 400, step: 5, bullseye: 5, spread: 200, unit: 'M' },
    sliderQuestion: 'Guess the development budget ($M)',
  },
  hltb_main: {
    id: 'hltb_main',
    label: 'Main story',
    question: 'Which takes longer to beat (main story)?',
    unitHint: 'hours — e.g. 18.5',
    valueLabel: 'Main story',
    slider: { min: 0, max: 100, step: 0.5, bullseye: 1, spread: 40, unit: 'h' },
    sliderQuestion: 'Guess how long it takes to beat the main story',
  },
  hltb_completionist: {
    id: 'hltb_completionist',
    label: '100% completion',
    question: 'Which takes longer to 100% complete?',
    unitHint: 'hours — e.g. 72',
    valueLabel: '100%',
    slider: { min: 0, max: 200, step: 1, bullseye: 2, spread: 90, unit: 'h' },
    sliderQuestion: 'Guess how long it takes to 100% complete',
  },
  steam_peak: {
    id: 'steam_peak',
    label: 'Steam peak',
    question: 'Which had the higher all-time Steam peak player count?',
    unitHint: 'peak concurrent players — e.g. 90000',
    valueLabel: 'Steam peak',
  },
  movie_adaptation: {
    id: 'movie_adaptation',
    label: 'First movie',
    question: 'Which got a movie adaptation FIRST?',
    unitHint: 'year of first film — e.g. 1994 (earlier wins)',
    valueLabel: '1st movie',
    lowerWins: true,
  },
  // ── Recommended additions (easy to source, fun to guess) ──
  steam_reviews: {
    id: 'steam_reviews',
    label: 'Steam reviews',
    question: 'Which has more Steam user reviews?',
    unitHint: 'total reviews — e.g. 250000',
    valueLabel: 'Steam reviews',
  },
  twitch_peak: {
    id: 'twitch_peak',
    label: 'Twitch peak',
    question: 'Which hit the higher peak concurrent Twitch viewers?',
    unitHint: 'peak viewers — e.g. 1200000',
    valueLabel: 'Twitch peak',
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
  // How this pair is played. Defaults to 'vs' for legacy rows (missing column).
  pairType: HighLowPairType
  // Side A is always present. For 'vs' it's one of the two contenders; for
  // 'slider'/'piggyback' it's the single game and `a.value` is the correct
  // answer players are guessing.
  a: HigherLowerSide
  // Only present for 'vs' pairs — the second contender.
  b?: HigherLowerSide
}

export type HigherLowerPuzzle = {
  id: string
  puzzle_week: string
  theme?: string
  pairs: HigherLowerPair[]
} & PuzzleDecor

// ── CONNECTIONS (daily) ─────────────────────────────────────────────────────
//
// A 16-word grouping puzzle (one new set per day). The player sorts 16 words
// into four hidden groups of four. Each group carries a difficulty (0 = easiest
// … 3 = hardest) whose color is only revealed once the group is solved. Group
// membership is by exact word string, so words are unique across the puzzle.

export const CONNECTIONS_GROUP_COUNT = 4
export const CONNECTIONS_GROUP_SIZE = 4
export const CONNECTIONS_WORD_COUNT =
  CONNECTIONS_GROUP_COUNT * CONNECTIONS_GROUP_SIZE // 16
export const CONNECTIONS_MAX_MISTAKES = 4

// Difficulty index 0..3. Color + label are revealed when the group is solved.
// The hexes intentionally match our existing accent tokens (mustard / lime /
// blue / coral) so the bands sit in the brand palette.
export type ConnectionsDifficulty = 0 | 1 | 2 | 3

export type ConnectionsDifficultyConfig = {
  difficulty: ConnectionsDifficulty
  label: string // 'Yellow' | 'Green' | 'Blue' | 'Red'
  tone: 'mustard' | 'lime' | 'blue' | 'coral' // maps to bg-<tone>
  hint: string // shown in the admin section header
}

export const CONNECTIONS_DIFFICULTIES: ConnectionsDifficultyConfig[] = [
  { difficulty: 0, label: 'Yellow', tone: 'mustard', hint: 'Easiest — straightforward.' },
  { difficulty: 1, label: 'Green', tone: 'lime', hint: 'Familiar trivia or definitions.' },
  { difficulty: 2, label: 'Blue', tone: 'blue', hint: 'Wordplay, associations, trickier facts.' },
  { difficulty: 3, label: 'Red', tone: 'coral', hint: 'Most abstract / cryptic.' },
]

export type ConnectionsGroup = {
  difficulty: ConnectionsDifficulty
  category: string // revealed label, e.g. "FromSoftware games"
  words: string[] // exactly CONNECTIONS_GROUP_SIZE
}

export type ConnectionsPuzzle = {
  id: string
  puzzle_date: string
  theme?: string
  groups: ConnectionsGroup[] // length CONNECTIONS_GROUP_COUNT
  // The 16 words in their fixed on-screen order (shuffled once at save time so
  // every player sees the same board). Each entry is a word in `groups`.
  layout: string[]
} & PuzzleDecor

export type PuzzleResult = {
  date: string
  gameType: GameType
  status: 'solved' | 'lost'
  guessCount: number
  guesses: Guess[]
  startedAt: number
  finishedAt: number
}
