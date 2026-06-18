import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  getMockArchivePuzzle,
  getMockBlurPuzzle,
  getMockCrosswordPuzzle,
  getMockHigherLowerPuzzle,
  getMockScreenshotPuzzle,
  getMockSoundtrackPuzzle,
  getMockTrophyPuzzle,
} from '../data/mockPuzzles'
import type {
  ArchiveMysteryBox,
  ArchivePuzzle,
  BlurPuzzle,
  CrosswordClue,
  CrosswordPuzzle,
  HigherLowerCategory,
  HigherLowerPair,
  HigherLowerPuzzle,
  ScreenshotPuzzle,
  SoundtrackPuzzle,
  TrophyPuzzle,
} from './types'

// ── READS ────────────────────────────────────────────────────────────────────

export async function fetchScreenshotPuzzle(
  date: string,
): Promise<ScreenshotPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockScreenshotPuzzle(date)
  const { data, error } = await sb
    .from('screenshot_puzzles')
    .select('*')
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
    submitter: data.submitter ?? undefined,
  }
}

export async function fetchTrophyPuzzle(date: string): Promise<TrophyPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockTrophyPuzzle(date)
  const { data, error } = await sb
    .from('trophy_puzzles')
    .select('*')
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
    submitter: data.submitter ?? undefined,
  }
}

export async function fetchSoundtrackPuzzle(
  date: string,
): Promise<SoundtrackPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockSoundtrackPuzzle(date)
  const { data, error } = await sb
    .from('soundtrack_puzzles')
    .select('*')
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
    submitter: data.submitter ?? undefined,
  }
}

export async function fetchBlurPuzzle(date: string): Promise<BlurPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockBlurPuzzle(date)
  const { data, error } = await sb
    .from('blur_puzzles')
    .select('*')
    .eq('puzzle_date', date)
    .maybeSingle()
  if (error || !data) return getMockBlurPuzzle(date)
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
    submitter: data.submitter ?? undefined,
  }
}

export async function fetchArchivePuzzle(week: string): Promise<ArchivePuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockArchivePuzzle(week)
  const { data, error } = await sb
    .from('archive_puzzles')
    .select('*')
    .eq('puzzle_week', week)
    .maybeSingle()
  if (error || !data) return getMockArchivePuzzle(week)
  const url = toPublicUrl('archive')
  return {
    id: data.id,
    puzzle_week: data.puzzle_week,
    game: {
      id: data.game_id,
      name: data.game_name,
      year: data.game_year ?? undefined,
      genre: data.game_genre ?? undefined,
    },
    weekly_theme: data.weekly_theme ?? undefined,
    clue_year: data.clue_year,
    clue_genre: data.clue_genre,
    clue_platform: data.clue_platform,
    clue_pitch: data.clue_pitch,
    clue_memo: data.clue_memo,
    clue_review: data.clue_review,
    audio_url: data.audio_path ? url(data.audio_path) : undefined,
    frame1_url: url(data.frame1_path),
    frame2_url: url(data.frame2_path),
    chest_logo_url: url(data.chest_logo_path),
    mystery_a: data.mystery_a as ArchiveMysteryBox,
    mystery_b: data.mystery_b as ArchiveMysteryBox,
    trash_crossed_out: data.trash_crossed_out,
    submitter: data.submitter ?? undefined,
  }
}

export async function fetchCrosswordPuzzle(
  date: string,
): Promise<CrosswordPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockCrosswordPuzzle(date)
  const { data, error } = await sb
    .from('crossword_puzzles')
    .select('*')
    .eq('puzzle_date', date)
    .maybeSingle()
  if (error || !data) return getMockCrosswordPuzzle(date)
  // Postgres text[] returns the JS string "NULL" or actually preserves nulls?
  // Supabase's PostgREST returns SQL NULL as JS null inside the array, so the
  // shape lines up with CrosswordPuzzle.solution directly.
  return {
    id: data.id,
    puzzle_date: data.puzzle_date,
    size: data.size,
    solution: data.solution as (string | null)[],
    clues_across: (data.clues_across as CrosswordClue[]) ?? [],
    clues_down: (data.clues_down as CrosswordClue[]) ?? [],
    submitter: data.submitter ?? undefined,
  }
}

export async function fetchHigherLowerPuzzle(
  week: string,
): Promise<HigherLowerPuzzle> {
  const sb = getSupabase()
  if (!sb) return getMockHigherLowerPuzzle(week)
  const { data, error } = await sb
    .from('higherlower_puzzles')
    .select('*')
    .eq('puzzle_week', week)
    .maybeSingle()
  if (error || !data) return getMockHigherLowerPuzzle(week)
  const { data: pairRows } = await sb
    .from('higherlower_pairs')
    .select('*')
    .eq('puzzle_id', data.id)
    .order('position', { ascending: true })
  const url = toPublicUrl('higherlower')
  const pairs: HigherLowerPair[] = (pairRows ?? []).map((r) => ({
    id: r.id,
    position: r.position,
    category: r.category as HigherLowerCategory,
    a: {
      game_id: r.game_a_id,
      game_name: r.game_a_name,
      game_year: r.game_a_year ?? undefined,
      cover_url: r.game_a_cover_path ? url(r.game_a_cover_path) : undefined,
      value: Number(r.game_a_value),
      display: r.game_a_display ?? undefined,
    },
    b: {
      game_id: r.game_b_id,
      game_name: r.game_b_name,
      game_year: r.game_b_year ?? undefined,
      cover_url: r.game_b_cover_path ? url(r.game_b_cover_path) : undefined,
      value: Number(r.game_b_value),
      display: r.game_b_display ?? undefined,
    },
  }))
  return {
    id: data.id,
    puzzle_week: data.puzzle_week,
    theme: data.theme ?? undefined,
    submitter: data.submitter ?? undefined,
    pairs,
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
