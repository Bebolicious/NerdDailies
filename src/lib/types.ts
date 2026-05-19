export type GameType = 'screenshot' | 'trophy' | 'soundtrack' | 'blur'

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
  2,
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

export type PuzzleResult = {
  date: string
  gameType: GameType
  status: 'solved' | 'lost'
  guessCount: number
  guesses: Guess[]
  startedAt: number
  finishedAt: number
}
