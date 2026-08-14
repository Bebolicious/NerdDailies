import { getSupabase, isSupabaseConfigured } from './supabase'
import { rowToDecor } from './decor'
import {
  getMockArchivePuzzle,
  getMockBlurPuzzle,
  getMockConnectionsPuzzle,
  getMockCrosswordPuzzle,
  getMockHigherLowerPuzzle,
  getMockScreenshotPuzzle,
  getMockSoundtrackPuzzle,
  getMockTrophyPuzzle,
} from '../data/mockPuzzles'
import type {
  ArchiveClue,
  ArchiveLink,
  ArchivePuzzle,
  BlurPuzzle,
  ConnectionsGroup,
  ConnectionsPuzzle,
  CrosswordClue,
  CrosswordPuzzle,
  HigherLowerCategory,
  HigherLowerPair,
  HigherLowerPuzzle,
  HighLowPairType,
  ScreenshotPuzzle,
  SoundtrackPuzzle,
  TrophyPuzzle,
} from './types'
import { ARCHIVE_DEFAULT_CANDLES } from './types'

// ── READS ────────────────────────────────────────────────────────────────────

export async function fetchScreenshotPuzzle(
  date: string,
): Promise<ScreenshotPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockScreenshotPuzzle(date)
  const { data, error } = await sb
    .from('screenshot_puzzles')
    .select(
      'id,puzzle_date,game_id,game_name,game_year,game_genre,image_paths,cover_path,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color',
    )
    .eq('puzzle_date', date)
    .maybeSingle()
  if (error || !data) return getMockScreenshotPuzzle(date)
  return {
    id: data.id,
    puzzle_date: data.puzzle_date,
    game: {
      id: data.game_id,
      name: data.game_name,
      year: data.game_year ?? undefined,
      genre: data.game_genre ?? undefined,
    },
    image_urls: (data.image_paths as string[]).map(toPublicUrl('screenshots')),
    cover_url: data.cover_path ? toPublicUrl('covers')(data.cover_path) : undefined,
    ...rowToDecor(data),
  }
}

export async function fetchTrophyPuzzle(date: string): Promise<TrophyPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockTrophyPuzzle(date)
  const { data, error } = await sb
    .from('trophy_puzzles')
    .select(
      'id,puzzle_date,game_id,game_name,game_year,game_genre,trophy_name,trophy_description,clues,rarity_pct,platform,gamerscore,cover_path,icon_path,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color',
    )
    .eq('puzzle_date', date)
    .maybeSingle()
  if (error || !data) return getMockTrophyPuzzle(date)
  return {
    id: data.id,
    puzzle_date: data.puzzle_date,
    game: {
      id: data.game_id,
      name: data.game_name,
      year: data.game_year ?? undefined,
      genre: data.game_genre ?? undefined,
    },
    trophy_name: data.trophy_name,
    trophy_description: data.trophy_description,
    clues: data.clues ?? [],
    rarity_pct: data.rarity_pct ?? undefined,
    platform: data.platform ?? undefined,
    gamerscore: data.gamerscore ?? undefined,
    cover_url: data.cover_path ? toPublicUrl('covers')(data.cover_path) : undefined,
    icon_url: data.icon_path ? toPublicUrl('covers')(data.icon_path) : undefined,
    ...rowToDecor(data),
  }
}

export async function fetchSoundtrackPuzzle(
  date: string,
): Promise<SoundtrackPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockSoundtrackPuzzle(date)
  const { data, error } = await sb
    .from('soundtrack_puzzles')
    .select(
      'id,puzzle_date,game_id,game_name,game_year,game_genre,audio_path,track_title,reveal_start_seconds,cover_path,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color',
    )
    .eq('puzzle_date', date)
    .maybeSingle()
  if (error || !data) return getMockSoundtrackPuzzle(date)
  return {
    id: data.id,
    puzzle_date: data.puzzle_date,
    game: {
      id: data.game_id,
      name: data.game_name,
      year: data.game_year ?? undefined,
      genre: data.game_genre ?? undefined,
    },
    audio_url: toPublicUrl('soundtracks')(data.audio_path),
    track_title: data.track_title ?? undefined,
    reveal_start_seconds: data.reveal_start_seconds ?? 0,
    cover_url: data.cover_path ? toPublicUrl('covers')(data.cover_path) : undefined,
    ...rowToDecor(data),
  }
}

// The blur row is the one puzzle two surfaces both need: the /blur page, and
// the sidebar (which has to know whether Back Cover hard mode is enabled today
// to decide if it renders the hard-mode tile — and the sidebar is on every
// page). Caching the in-flight promise per date collapses all of that to a
// single query per session, which is strictly less egress than the old
// one-query-per-/blur-visit behaviour.
//
// Staleness is the trade: an admin editing today's puzzle mid-session won't be
// picked up until reload. That was already true within a page view, and a
// daily drop doesn't move once it's live.
const blurCache = new Map<string, Promise<BlurPuzzle>>()

export function fetchBlurPuzzle(date: string): Promise<BlurPuzzle> {
  const hit = blurCache.get(date)
  if (hit) return hit
  const p = loadBlurPuzzle(date).catch((err) => {
    // Never cache a rejection — a transient network blip would otherwise
    // poison this date for the rest of the session.
    blurCache.delete(date)
    throw err
  })
  blurCache.set(date, p)
  return p
}

async function loadBlurPuzzle(date: string): Promise<BlurPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockBlurPuzzle(date)
  const { data, error } = await sb
    .from('blur_puzzles')
    .select(
      'id,puzzle_date,game_id,game_name,game_year,game_genre,cover_path,backcover_enabled,backcover_path,backcover_game_id,backcover_game_name,backcover_game_year,backcover_game_genre,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color',
    )
    .eq('puzzle_date', date)
    .maybeSingle()
  if (error || !data) return getMockBlurPuzzle(date)
  // Hard mode only materializes when the admin enabled it AND both of its
  // required fields are set — a half-filled row must not offer the player a
  // round with no image or no answer.
  const back =
    data.backcover_enabled && data.backcover_path && data.backcover_game_id
      ? {
          game: {
            id: data.backcover_game_id,
            name: data.backcover_game_name ?? '',
            year: data.backcover_game_year ?? undefined,
            genre: data.backcover_game_genre ?? undefined,
          },
          cover_url: toPublicUrl('covers')(data.backcover_path),
        }
      : undefined
  return {
    id: data.id,
    puzzle_date: data.puzzle_date,
    game: {
      id: data.game_id,
      name: data.game_name,
      year: data.game_year ?? undefined,
      genre: data.game_genre ?? undefined,
    },
    cover_url: toPublicUrl('covers')(data.cover_path),
    back,
    ...rowToDecor(data),
  }
}

export async function fetchArchivePuzzle(week: string): Promise<ArchivePuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockArchivePuzzle(week)
  const { data, error } = await sb
    .from('archive_puzzles')
    .select(
      'id,puzzle_week,game_id,game_name,game_year,game_genre,game_b_id,game_b_name,game_b_year,game_b_genre,link_preset,link_prompt,link_answer,link_accept,weekly_theme,candles,clues,trash_crossed_out,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color',
    )
    .eq('puzzle_week', week)
    .maybeSingle()
  if (error || !data) return getMockArchivePuzzle(week)
  // A row that predates the rework (or one saved half-finished) has no second
  // game — it can't be played under the three-answer rules, so fall back to the
  // mock room rather than rendering a broken week.
  if (!data.game_b_id || !data.link_answer) return getMockArchivePuzzle(week)
  const url = toPublicUrl('archive')
  const link: ArchiveLink = {
    preset: data.link_preset ?? 'custom',
    prompt: data.link_prompt ?? 'What do these two games have in common?',
    answer: data.link_answer,
    accept: data.link_accept ?? [],
  }
  return {
    id: data.id,
    puzzle_week: data.puzzle_week,
    game_a: {
      id: data.game_id,
      name: data.game_name,
      year: data.game_year ?? undefined,
      genre: data.game_genre ?? undefined,
    },
    game_b: {
      id: data.game_b_id,
      name: data.game_b_name,
      year: data.game_b_year ?? undefined,
      genre: data.game_b_genre ?? undefined,
    },
    link,
    weekly_theme: data.weekly_theme ?? undefined,
    candles: data.candles ?? ARCHIVE_DEFAULT_CANDLES,
    clues: resolveArchiveClues(data.clues, url),
    trash_crossed_out: data.trash_crossed_out ?? undefined,
    ...rowToDecor(data),
  }
}

// Clue bodies store a bucket PATH in the DB; the player wants a public URL.
// Swap them here so nothing downstream has to know about storage.
function resolveArchiveClues(
  raw: unknown,
  url: (path: string) => string,
): ArchiveClue[] {
  if (!Array.isArray(raw)) return []
  return (raw as ArchiveClue[]).map((clue) =>
    clue.body.kind === 'text' || !clue.body.src
      ? clue
      : { ...clue, body: { ...clue.body, src: url(clue.body.src) } },
  )
}

export async function fetchCrosswordPuzzle(
  week: string,
): Promise<CrosswordPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockCrosswordPuzzle(week)
  const { data, error } = await sb
    .from('crossword_puzzles')
    .select('id,puzzle_week,size,solution,clues_across,clues_down,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color')
    .eq('puzzle_week', week)
    .maybeSingle()
  if (error || !data) return getMockCrosswordPuzzle(week)
  // Postgres text[] returns the JS string "NULL" or actually preserves nulls?
  // Supabase's PostgREST returns SQL NULL as JS null inside the array, so the
  // shape lines up with CrosswordPuzzle.solution directly.
  return {
    id: data.id,
    puzzle_week: data.puzzle_week,
    size: data.size,
    solution: data.solution as (string | null)[],
    clues_across: (data.clues_across as CrosswordClue[]) ?? [],
    clues_down: (data.clues_down as CrosswordClue[]) ?? [],
    ...rowToDecor(data),
  }
}

// One entry of the `games` JSONB shelf as stored by the admin editor (bucket
// paths, not URLs).
type AuctionGameRow = {
  game_id: number
  game_name: string
  game_year?: number | null
  value: number | string
  display?: string | null
  cover_path?: string | null
}

// 'piggyback' rounds were removed in favor of 'auction'. A stored piggyback row
// is a single game + its true value, which is exactly a slider round, so play
// it as one rather than dropping authored content. (schema.sql migrates the
// column too — this keeps a not-yet-migrated database playable.)
function normalizePairType(raw: string | null): HighLowPairType {
  if (raw === 'piggyback') return 'slider'
  if (raw === 'slider' || raw === 'auction' || raw === 'vs') return raw
  return 'vs'
}

export async function fetchHigherLowerPuzzle(
  week: string,
): Promise<HigherLowerPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockHigherLowerPuzzle(week)
  const { data, error } = await sb
    .from('higherlower_puzzles')
    .select('id,puzzle_week,theme,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color')
    .eq('puzzle_week', week)
    .maybeSingle()
  if (error || !data) return getMockHigherLowerPuzzle(week)
  const { data: pairRows } = await sb
    .from('higherlower_pairs')
    .select(
      'id,position,pair_type,category,games,game_a_id,game_a_name,game_a_year,game_a_cover_path,game_a_value,game_a_display,game_b_id,game_b_name,game_b_year,game_b_cover_path,game_b_value,game_b_display',
    )
    .eq('puzzle_id', data.id)
    .order('position', { ascending: true })
  const url = toPublicUrl('higherlower')
  const pairs: HigherLowerPair[] = (pairRows ?? []).map((r) => ({
    id: r.id,
    position: r.position,
    pairType: normalizePairType(r.pair_type),
    category: r.category as HigherLowerCategory,
    a: {
      game_id: r.game_a_id,
      game_name: r.game_a_name,
      game_year: r.game_a_year ?? undefined,
      cover_url: r.game_a_cover_path ? url(r.game_a_cover_path) : undefined,
      value: Number(r.game_a_value),
      display: r.game_a_display ?? undefined,
    },
    // Side B only exists for vs pairs.
    b:
      r.game_b_id != null
        ? {
            game_id: r.game_b_id,
            game_name: r.game_b_name,
            game_year: r.game_b_year ?? undefined,
            cover_url: r.game_b_cover_path
              ? url(r.game_b_cover_path)
              : undefined,
            value: Number(r.game_b_value),
            display: r.game_b_display ?? undefined,
          }
        : undefined,
    // The auction shelf. Stored as JSONB with bucket paths; resolve each to a
    // public URL here so the player page only ever sees URLs.
    games: Array.isArray(r.games) && r.games.length > 0
      ? (r.games as AuctionGameRow[]).map((g) => ({
          game_id: g.game_id,
          game_name: g.game_name,
          game_year: g.game_year ?? undefined,
          cover_url: g.cover_path ? url(g.cover_path) : undefined,
          value: Number(g.value),
          display: g.display ?? undefined,
        }))
      : undefined,
  }))
  return {
    id: data.id,
    puzzle_week: data.puzzle_week,
    theme: data.theme ?? undefined,
    ...rowToDecor(data),
    pairs,
  }
}

export async function fetchConnectionsPuzzle(
  date: string,
): Promise<ConnectionsPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockConnectionsPuzzle(date)
  const { data, error } = await sb
    .from('connections_puzzles')
    .select('id,puzzle_date,theme,groups,layout,submitter,banner_text,banner_color,banner_text_color,banner_style,effect_type,effect_emoji,effect_color')
    .eq('puzzle_date', date)
    .maybeSingle()
  if (error || !data) return getMockConnectionsPuzzle(date)
  return {
    id: data.id,
    puzzle_date: data.puzzle_date,
    theme: data.theme ?? undefined,
    groups: data.groups as ConnectionsGroup[],
    layout: (data.layout as string[]) ?? [],
    ...rowToDecor(data),
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function toPublicUrl(bucket: string) {
  return (path: string) => {
    const sb = getSupabase()
    if (!sb || !path) return path
    if (path.startsWith('http')) return path
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }
}

export function supabaseConfigured(): boolean {
  return isSupabaseConfigured()
}
