import type {
  ArchiveClue,
  ArchivePuzzle,
  BlurPuzzle,
  ConnectionsGroup,
  ConnectionsPuzzle,
  CrosswordPuzzle,
  HigherLowerCategory,
  HigherLowerPuzzle,
  ScreenshotPuzzle,
  SoundtrackPuzzle,
  TrophyPuzzle,
} from '../lib/types'
import { ARCHIVE_DEFAULT_CANDLES, HIGHERLOWER_PAIR_COUNT } from '../lib/types'
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

// A full mock archive room so the weekly is playable with no `.env`. Exercises
// every container, both body kinds that don't need a real upload (text +
// image), all five clue subjects, and two hidden clues — so the mock is a
// genuine smoke test of the player page, not just a stub.
export function getMockArchivePuzzle(week: string): ArchivePuzzle {
  const seed = hash(week + 'archive')
  const gameA = pickGame(seed + 23)
  const gameB = pickGame(seed + 41)
  const herring = pickGame(seed + 51)
  const crossed = pickGame(seed + 77)
  const linkYear = String(gameA.year ?? '2000')

  const clue = (
    n: number,
    c: ArchiveClue['container'],
    preset: string,
    emoji: string,
    name: string,
    subject: ArchiveClue['subject'],
    body: ArchiveClue['body'],
    extra: Partial<ArchiveClue> = {},
  ): ArchiveClue => ({
    id: `mock-clue-${seed}-${n}`,
    container: c,
    preset,
    emoji,
    name,
    subject,
    cost: c === 'chest' ? 2 : 1,
    body,
    ...extra,
  })

  const clues: ArchiveClue[] = [
    clue(1, 'wall', 'smeared-portrait', '🖼️', 'Smeared portrait', 'a', {
      kind: 'image',
      src: fakeCover(seed + 2, 'SUBJECT A'),
      sharpens: true,
    }),
    clue(2, 'wall', 'framed-poster', '🖼️', 'Framed poster', 'b', {
      kind: 'image',
      src: fakeCover(seed + 5, 'SUBJECT B'),
      sharpens: true,
    }),
    clue(3, 'chest', 'wax-letter', '🔒', 'Sealed chest', 'link', {
      kind: 'text',
      text: `Both files stamped the same year. Look at the ledger — ${linkYear[0]}${'•'.repeat(3)}.`,
    }),
    clue(4, 'shelf', 'ledger', '📒', 'Dated ledger', 'both', {
      kind: 'text',
      text: `Filed under ${linkYear}. Two entries, same shelf.`,
    }),
    clue(5, 'shelf', 'index-card', '🗂️', 'Genre index card', 'a', {
      kind: 'text',
      text: gameA.genre ?? 'Mixed',
    }),
    clue(6, 'shelf', 'manifest', '📋', 'Shipping manifest', 'b', {
      kind: 'text',
      text: gameB.platforms?.[0] ?? 'PC',
    }),
    clue(7, 'cabinet', 'memo', '📝', 'Internal memo', 'a', {
      kind: 'text',
      text: "Reminder: the protagonist's coat physics stay on the cutting-room floor.",
    }),
    clue(8, 'cabinet', 'review', '⭐', 'Review clipping', 'b', {
      kind: 'text',
      text: `9.${(seed % 5) + 2}/10 — "A landmark in player freedom." — Mock Gamer`,
    }),
    clue(9, 'cabinet', 'redacted', '⬛', 'Redacted report', 'link', {
      kind: 'text',
      text: 'Both ██████ shipped in the same ████ — that is the whole connection.',
    }),
    clue(10, 'radio', 'channel', '📻', 'Channel 7', 'a', {
      kind: 'text',
      text: `"…and that's why nobody goes near ${gameA.name.split(' ')[0]} after dark."`,
    }),
    clue(11, 'radio', 'broadcast', '📡', 'Emergency broadcast', 'herring', {
      kind: 'text',
      text: `This bulletin concerns ${herring.name}. It is not one of your two files.`,
    }),
    clue(
      12,
      'mystery',
      'lore',
      '📦',
      'Mystery box',
      'both',
      {
        kind: 'text',
        text: `The original design doc called one of these "${gameA.name
          .split(' ')
          .reverse()
          .join(' ')}".`,
      },
      { outcome: 'lore', hiddenSpot: 'shelf' },
    ),
    clue(
      13,
      'mystery',
      'jackpot',
      '📦',
      'Mystery box',
      'b',
      { kind: 'image', src: fakeCover(seed + 9, gameB.name) },
      { outcome: 'jackpot', hiddenSpot: 'vent' },
    ),
  ]

  return {
    id: 'mock-archive-' + seed,
    puzzle_week: week,
    game_a: gameA,
    game_b: gameB,
    link: {
      preset: 'year',
      prompt: 'Both games came out the same year. Which year?',
      answer: linkYear,
      accept: [`the year ${linkYear}`, `released in ${linkYear}`],
    },
    weekly_theme: 'Weekly theme: dusty mock puzzle',
    candles: ARCHIVE_DEFAULT_CANDLES,
    clues,
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
// Week-independent because hand-crafting a valid interlocking puzzle per week
// is out of scope for a placeholder — the admin editor will produce the real
// weekly puzzles.
export function getMockCrosswordPuzzle(week: string): CrosswordPuzzle {
  const solution: (string | null)[] = [
    'S', 'P', 'A', 'R',
    'P', 'A', 'C', 'E',
    'A', 'C', 'E', 'S',
    'R', 'E', 'S', 'T',
  ]
  return {
    id: 'mock-crossword-' + week,
    puzzle_week: week,
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
  // Sprinkle a few single-game pair types in so the slider / piggyback flows
  // are playable with no Supabase configured.
  const pairType = (i: number): 'vs' | 'slider' | 'piggyback' =>
    i === 2 || i === 6 ? 'slider' : i === 9 ? 'piggyback' : 'vs'
  const pairs = Array.from({ length: HIGHERLOWER_PAIR_COUNT }, (_, i) => {
    const type = pairType(i)
    const a = pickGame(seed + i * 5)
    let b = pickGame(seed + i * 5 + 1)
    if (b.id === a.id) b = pickGame(seed + i * 5 + 2)
    // Single-game types force a slider-capable category.
    const category: HigherLowerCategory =
      type === 'vs'
        ? categories[(seed + i) % categories.length]
        : i === 6
          ? 'hltb_main'
          : 'metacritic'
    const [va, vb] = mockValues(category, seed + i)
    return {
      id: `mock-pair-${seed}-${i}`,
      position: i,
      pairType: type,
      category,
      a: {
        game_id: a.id,
        game_name: a.name,
        game_year: a.year,
        value: va.value,
        display: va.display,
      },
      b:
        type === 'vs'
          ? {
              game_id: b.id,
              game_name: b.name,
              game_year: b.year,
              value: vb.value,
              display: vb.display,
            }
          : undefined,
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

// Deterministic mock for the daily Connections puzzle. Four fixed groups of
// four words; the board layout is shuffled with a date-seeded RNG so it's
// stable for a given day but varies day to day.
export function getMockConnectionsPuzzle(date: string): ConnectionsPuzzle {
  const groups: ConnectionsGroup[] = [
    {
      difficulty: 0,
      category: 'Nintendo mascots',
      words: ['Mario', 'Link', 'Kirby', 'Pikachu'],
    },
    {
      difficulty: 1,
      category: 'FromSoftware games',
      words: ['Sekiro', 'Bloodborne', 'Elden Ring', 'Dark Souls'],
    },
    {
      difficulty: 2,
      category: '___ of War',
      words: ['God', 'Gears', 'Ace', 'Art'],
    },
    {
      difficulty: 3,
      category: 'Hidden colors',
      words: ['Crimson', 'Azure', 'Olive', 'Violet'],
    },
  ]
  const allWords = groups.flatMap((g) => g.words)
  const seed = hash(date + 'connections')
  const layout = seededShuffle(allWords, seed)
  return {
    id: 'mock-connections-' + seed,
    puzzle_date: date,
    theme: 'Mock daily connections',
    groups,
    layout,
  }
}

// A small deterministic Fisher–Yates so the mock board is stable per week.
function seededShuffle<T>(input: T[], seed: number): T[] {
  const arr = input.slice()
  let s = seed || 1
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
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
