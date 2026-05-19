import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  getMockBlurPuzzle,
  getMockScreenshotPuzzle,
  getMockSoundtrackPuzzle,
  getMockTrophyPuzzle,
} from '../data/mockPuzzles'
import type {
  BlurPuzzle,
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
