import type {
  ArchivePuzzle,
  BlurPuzzle,
  CrosswordPuzzle,
  ScreenshotPuzzle,
  SoundtrackPuzzle,
  TrophyPuzzle,
} from '../lib/types'
import { MOCK_CATALOG } from './mockCatalog'

// SVG-based placeholder "screenshots" so the UI is playable without uploads.
// Builds a stack of colored stripes — gets more detailed each step.
function stripeSvg(seed: number, detail: number): string {
  const palettes = [
    ['#f5c6d2', '#ffb6b6', '#a4dbe6', '#b5e548', '#f4b73e'],
    ['#5167e8', '#aabaff', '#f5ebd6', '#ff5d5d', '#1b1b3a'],
    ['#b5e548', '#7ac8be', '#f5c6d2', '#f4b73e', '#5167e8'],
  ]
  const palette = palettes[seed % palettes.length]
  const stripes = palette
    .map(
      (c, i) =>
        `<rect x='0' y='${i * 30}' width='320' height='30' fill='${c}'/>`,
    )
    .join('')
  let extras = ''
  for (let i = 0; i < detail; i++) {
    const x = (i * 47 + seed * 13) % 280
    const y = (i * 31 + seed * 7) % 120
    const w = 20 + (i % 4) * 12
    const h = 12 + (i % 3) * 8
    const c = palette[(i + seed) % palette.length]
    extras += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${c}' stroke='#1b1b3a' stroke-width='2'/>`
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'>${stripes}${extras}<rect x='298' y='162' width='10' height='10' fill='#b5e548' stroke='#1b1b3a' stroke-width='2'/></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

function pickGame(seed: number) {
  return MOCK_CATALOG[seed % MOCK_CATALOG.length]
}

// Mock daily puzzles, indexed by date string. The admin dashboard will
// eventually populate this from Supabase — for now we generate three games
// per day from a seeded catalog so the UI always has something to render.
export function getMockScreenshotPuzzle(date: string): ScreenshotPuzzle {
  const seed = hash(date + 'screenshot')
  const game = pickGame(seed)
  return {
    id: 'mock-' + seed,
    puzzle_date: date,
    game,
    image_urls: Array.from({ length: 6 }, (_, i) => stripeSvg(seed, i * 4)),
  }
}

export function getMockTrophyPuzzle(date: string): TrophyPuzzle {
  const seed = hash(date + 'trophy')
  const game = pickGame(seed + 7)
  return {
    id: 'mock-' + seed,
    puzzle_date: date,
    game,
    trophy_name: '“I AM ERROR.”',
    trophy_description: 'Speak to every NPC in the Town Without a Name.',
    clues: [
      `Genre: ${game.genre ?? 'Mixed'}`,
      `Year released: ${game.year ?? 'unknown'}`,
      `Platforms: ${game.platforms?.[0] ?? 'multi'}`,
      `Title starts with: "${game.name.charAt(0)}"`,
    ],
    rarity_pct: 4.2,
    platform: game.platforms?.[0] ?? 'PC',
    gamerscore: 12,
  }
}

// A vibrant portrait SVG used as the mock blur game cover (3:4) — a stand-in
// for the official game cover so the blur/sharpen reveal has something
// readable to land on.
function fakeCover(seed: number, name: string): string {
  const palettes = [
    ['#5167e8', '#aabaff', '#f5ebd6', '#ff5d5d'],
    ['#1b1b3a', '#b5e548', '#f5c6d2', '#f4b73e'],
    ['#7ac8be', '#f4b73e', '#1b1b3a', '#ffb6b6'],
  ]
  const palette = palettes[seed % palettes.length]
  const ringCount = 7
  const rings = Array.from({ length: ringCount })
    .map((_, i) => {
      const r = 50 + i * 38
      const c = palette[i % palette.length]
      return `<circle cx='300' cy='320' r='${r}' fill='none' stroke='${c}' stroke-width='14'/>`
    })
    .join('')
  const safeName = (name || '?').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 800'>` +
    `<rect width='600' height='800' fill='${palette[0]}'/>` +
    rings +
    `<text x='300' y='740' text-anchor='middle' font-family='Courier' font-size='36' font-weight='bold' fill='${palette[2]}'>${safeName}</text>` +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export function getMockBlurPuzzle(date: string): BlurPuzzle {
  const seed = hash(date + 'blur')
  const game = pickGame(seed + 19)
  return {
    id: 'mock-' + seed,
    puzzle_date: date,
    game,
    cover_url: fakeCover(seed, game.name),
  }
}

export function getMockArchivePuzzle(week: string): ArchivePuzzle {
  const seed = hash(week + 'archive')
  const game = pickGame(seed + 23)
  const herring = pickGame(seed + 51)
  const crossed = pickGame(seed + 77)
  return {
    id: 'mock-archive-' + seed,
    puzzle_week: week,
    game,
    weekly_theme: 'Weekly theme: dusty mock puzzle',
    clue_year: String(game.year ?? '????'),
    clue_genre: game.genre ?? 'Mixed',
    clue_platform: game.platforms?.[0] ?? 'PC',
    clue_pitch: 'A landmark title — the kind that defined what came next.',
    clue_memo: 'Internal note: keep the protagonist\'s coat physics on the cutting-room floor.',
    clue_review: `9.${(seed % 5) + 2}/10 — "A landmark in player freedom." — Mock Gamer`,
    audio_url: '',
    frame1_url: fakeCover(seed + 2, 'GAMEPLAY'),
    frame2_url: fakeCover(seed + 5, 'KEY ART'),
    chest_logo_url: fakeCover(seed + 9, game.name.slice(0, 3) + '…'),
    mystery_a: {
      type: 'lore',
      text: `The original design doc called this game "${game.name.split(' ').reverse().join(' ')}".`,
    },
    mystery_b: {
      type: 'redHerring',
      game: herring.name,
      text: `Misfiled by Gerald again — this note is about ${herring.name}.`,
    },
    trash_crossed_out: crossed.name,
  }
}

// A canned mini-crossword used when Supabase isn't configured. The 4x4 is a
// symmetric "double crossword" — every row word matches the column at the
// same index, so all eight slots are real words: SPAR, PACE, ACES, REST.
//
//     0  1  2  3
//  0  S  P  A  R
//  1  P  A  C  E
//  2  A  C  E  S
//  3  R  E  S  T
//
// Date-independent because hand-crafting a valid interlocking puzzle per date
// is out of scope for a placeholder — the admin editor will produce the real
// daily puzzles.
export function getMockCrosswordPuzzle(date: string): CrosswordPuzzle {
  const solution: (string | null)[] = [
    'S', 'P', 'A', 'R',
    'P', 'A', 'C', 'E',
    'A', 'C', 'E', 'S',
    'R', 'E', 'S', 'T',
  ]
  return {
    id: 'mock-crossword-' + date,
    puzzle_date: date,
    size: 4,
    solution,
    clues_across: [
      { number: 1, text: 'Bit of dialogue or a boxing exchange.' },
      { number: 5, text: 'Walking speed; rate of movement.' },
      { number: 6, text: 'Tops in a deck of cards.' },
      { number: 7, text: 'Take a break.' },
    ],
    clues_down: [
      { number: 1, text: 'Bit of dialogue or a boxing exchange.' },
      { number: 2, text: 'Walking speed; rate of movement.' },
      { number: 3, text: 'Tops in a deck of cards.' },
      { number: 4, text: 'Take a break.' },
    ],
  }
}

export function getMockSoundtrackPuzzle(date: string): SoundtrackPuzzle {
  const seed = hash(date + 'soundtrack')
  const game = pickGame(seed + 13)
  return {
    id: 'mock-' + seed,
    puzzle_date: date,
    game,
    audio_url: '', // empty = silent placeholder; admin upload swaps this in
    track_title: 'Main Theme',
    reveal_start_seconds: 0,
  }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
