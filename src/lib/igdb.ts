import { getSupabase } from './supabase'
import { MOCK_CATALOG } from '../data/mockCatalog'
import type { IgdbGame } from './types'

// Queries the `public.games` table in Supabase (populated by
// scripts/import-igdb-games.mjs from IGDB). Falls back to the 60-game mock
// catalog when Supabase isn't configured, so the UI stays playable out of
// the box without an .env.
//
// Search uses ILIKE '%q%' which stays fast thanks to the pg_trgm GIN index
// on games.name (see supabase/schema.sql).

const SEARCH_LIMIT = 12

type GameRow = {
  id: number
  name: string
  year: number | null
  genre: string | null
  platforms: string[] | null
}

function rowToGame(row: GameRow): IgdbGame {
  return {
    id: row.id,
    name: row.name,
    year: row.year ?? undefined,
    genre: row.genre ?? undefined,
    platforms: row.platforms ?? undefined,
  }
}

function searchMock(q: string): IgdbGame[] {
  return MOCK_CATALOG.filter((g) => g.name.toLowerCase().includes(q)).slice(
    0,
    SEARCH_LIMIT,
  )
}

export async function searchGames(query: string): Promise<IgdbGame[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const sb = getSupabase()
  if (!sb) {
    await new Promise((r) => setTimeout(r, 80))
    return searchMock(q)
  }

  // Escape ILIKE wildcards in user input so a search for "100%" doesn't blow up.
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`)
  const { data, error } = await sb
    .from('games')
    .select('id,name,year,genre,platforms')
    .ilike('name', `%${escaped}%`)
    .order('name')
    .limit(SEARCH_LIMIT)

  if (error) {
    console.warn('[igdb] Supabase search failed, falling back to mock:', error)
    return searchMock(q)
  }
  if (!data) return []
  return (data as GameRow[]).map(rowToGame)
}

export async function getGameById(id: number): Promise<IgdbGame | null> {
  const sb = getSupabase()
  if (!sb) return MOCK_CATALOG.find((g) => g.id === id) ?? null

  const { data, error } = await sb
    .from('games')
    .select('id,name,year,genre,platforms')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.warn('[igdb] Supabase getById failed, falling back to mock:', error)
    return MOCK_CATALOG.find((g) => g.id === id) ?? null
  }
  return data ? rowToGame(data as GameRow) : null
}
