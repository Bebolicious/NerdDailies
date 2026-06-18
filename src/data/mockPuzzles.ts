import type {
  ArchivePuzzle,
  BlurPuzzle,
  CrosswordPuzzle,
  HigherLowerCategory,
  HigherLowerPuzzle,
  ScreenshotPuzzle,
  SoundtrackPuzzle,
  TrophyPuzzle,
} from '../lib/types'
import { HIGHERLOWER_PAIR_COUNT } from '../lib/types'
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
    cover_url: fakeCover(seed, game.name),
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

// Deterministic mock for the weekly Higher/Lower gauntlet. Cycles through the
// catalogue, picks a category per pair, and synthesises plausible numeric
// values so the UI is fully playable with no Supabase configured.
export function getMockHigherLowerPuzzle(week: string): HigherLowerPuzzle {
  const seed = hash(week + 'higherlower')
  const categories: HigherLowerCategory[] = [
    'metacritic',
    'steam_rating',
    'copies_sold',
    'release_year',
    'speedrun_wr',
    'budget',
    'hltb_main',
    'hltb_completionist',
    'steam_peak',
    'movie_adaptation',
    'steam_reviews',
    'twitch_peak',
  ]
  const pairs = Array.from({ length: HIGHERLOWER_PAIR_COUNT }, (_, i) => {
    const a = pickGame(seed + i * 5)
    let b = pickGame(seed + i * 5 + 1)
    if (b.id === a.id) b = pickGame(seed + i * 5 + 2)
    const category = categories[(seed + i) % categories.length]
    const [va, vb] = mockValues(category, seed + i)
    return {
      id: `mock-pair-${seed}-${i}`,
      position: i,
      category,
      a: {
        game_id: a.id,
        game_name: a.name,
        game_year: a.year,
        value: va.value,
        display: va.display,
      },
      b: {
        game_id: b.id,
        game_name: b.name,
        game_year: b.year,
        value: vb.value,
        display: vb.display,
      },
    }
  })
  return {
    id: 'mock-higherlower-' + seed,
    puzzle_week: week,
    theme: 'Mock weekly gauntlet · seeded values',
    pairs,
  }
}

function mockValues(
  category: HigherLowerCategory,
  seed: number,
): [{ value: number; display?: string }, { value: number; display?: string }] {
  const r = (n: number) => Math.abs(((seed + n) * 9301 + 49297) % 233280) / 233280
  switch (category) {
    case 'metacritic':
      return [
        { value: 70 + Math.round(r(1) * 28) },
        { value: 70 + Math.round(r(2) * 28) },
      ]
    case 'steam_rating':
      return [
        { value: 75 + Math.round(r(1) * 24), display: `${75 + Math.round(r(1) * 24)}%` },
        { value: 75 + Math.round(r(2) * 24), display: `${75 + Math.round(r(2) * 24)}%` },
      ]
    case 'copies_sold': {
      const a = +(1 + r(1) * 40).toFixed(1)
      const b = +(1 + r(2) * 40).toFixed(1)
      return [
        { value: a, display: `${a}M` },
        { value: b, display: `${b}M` },
      ]
    }
    case 'release_year':
      return [
        { value: 1995 + Math.round(r(1) * 29) },
        { value: 1995 + Math.round(r(2) * 29) },
      ]
    case 'speedrun_wr': {
      const a = Math.round(r(1) * 7200) + 60
      const b = Math.round(r(2) * 7200) + 60
      return [
        { value: a, display: formatSeconds(a) },
        { value: b, display: formatSeconds(b) },
      ]
    }
    case 'budget': {
      const a = Math.round(r(1) * 380) + 5
      const b = Math.round(r(2) * 380) + 5
      return [
        { value: a, display: `$${a}M` },
        { value: b, display: `$${b}M` },
      ]
    }
    case 'hltb_main': {
      const a = +(2 + r(1) * 60).toFixed(1)
      const b = +(2 + r(2) * 60).toFixed(1)
      return [
        { value: a, display: `${a}h` },
        { value: b, display: `${b}h` },
      ]
    }
    case 'hltb_completionist': {
      const a = +(5 + r(1) * 120).toFixed(1)
      const b = +(5 + r(2) * 120).toFixed(1)
      return [
        { value: a, display: `${a}h` },
        { value: b, display: `${b}h` },
      ]
    }
    case 'steam_peak': {
      const a = Math.round(r(1) * 900000) + 1000
      const b = Math.round(r(2) * 900000) + 1000
      return [
        { value: a, display: a.toLocaleString() },
        { value: b, display: b.toLocaleString() },
      ]
    }
    case 'movie_adaptation': {
      // Year of the first film adaptation — earlier (lower) wins.
      const a = 1985 + Math.round(r(1) * 35)
      const b = 1985 + Math.round(r(2) * 35)
      return [
        { value: a, display: String(a) },
        { value: b, display: String(b) },
      ]
    }
    case 'steam_reviews': {
      const a = Math.round(r(1) * 490000) + 1000
      const b = Math.round(r(2) * 490000) + 1000
      return [
        { value: a, display: a.toLocaleString() },
        { value: b, display: b.toLocaleString() },
      ]
    }
    case 'twitch_peak': {
      const a = Math.round(r(1) * 1400000) + 5000
      const b = Math.round(r(2) * 1400000) + 5000
      return [
        { value: a, display: a.toLocaleString() },
        { value: b, display: b.toLocaleString() },
      ]
    }
  }
}

function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
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
    cover_url: fakeCover(seed, game.name),
  }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
