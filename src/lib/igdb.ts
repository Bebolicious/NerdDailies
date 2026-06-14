import Fuse from 'fuse.js'
import { getSupabase } from './supabase'
import { MOCK_CATALOG } from '../data/mockCatalog'
import type { IgdbGame } from './types'

// Catalog search for the player guess input and admin GamePicker. Two-stage
// design:
//
//   1. Candidate fetch — Postgres ILIKE on `public.games` using each token of
//      the query (e.g. "resident evil" → tokens ["resident", "evil"]). Tokens
//      are OR'd together via PostgREST `.or()`, so we get a wide candidate set
//      that covers names which contain *any* of the tokens. Limit is generous
//      (~60) so subtitles like "Resident Evil: Revelations" survive past the
//      alphabetical cutoff that a strict `%resident evil%` substring + name
//      sort would lose.
//   2. Client-side re-rank — Fuse.js scores each candidate against the raw
//      query with token-aware fuzzy matching, ignoring punctuation. The
//      top-ranked results are what the UI shows. This is what makes
//      "resident evil" surface Revelations *and* numbered entries together,
//      and survives the user adding or omitting a colon.
//
// Mock catalog (no `.env`) goes through the same Fuse step so behavior matches
// the cloud path.

const DISPLAY_LIMIT = 12
const CANDIDATE_LIMIT = 60

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

const FUSE_OPTIONS = {
  keys: ['name'],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: false,
  minMatchCharLength: 2,
  useExtendedSearch: false,
}

function rerank(candidates: IgdbGame[], query: string): IgdbGame[] {
  if (candidates.length === 0) return []
  const fuse = new Fuse(candidates, FUSE_OPTIONS)
  const hits = fuse.search(query, { limit: DISPLAY_LIMIT })
  return hits.map((h) => h.item)
}

// Split the raw query into search tokens. Lowercased, punctuation stripped,
// tokens under 2 chars dropped (they'd match too much). Empty input → [].
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2)
}

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

function searchMock(rawQuery: string): IgdbGame[] {
  return rerank([...MOCK_CATALOG], rawQuery)
}

export async function searchGames(query: string): Promise<IgdbGame[]> {
  const raw = query.trim()
  if (!raw) return []

  const sb = getSupabase()
  if (!sb) {
    await new Promise((r) => setTimeout(r, 80))
    return searchMock(raw)
  }

  const tokens = tokenize(raw)
  // If the input is all noise (e.g. just punctuation), fall back to a single
  // substring match on the trimmed input so the user gets *something*.
  const orFilter =
    tokens.length > 0
      ? tokens.map((t) => `name.ilike.%${escapeIlike(t)}%`).join(',')
      : `name.ilike.%${escapeIlike(raw.toLowerCase())}%`

  const { data, error } = await sb
    .from('games')
    .select('id,name,year,genre,platforms')
    .or(orFilter)
    .limit(CANDIDATE_LIMIT)

  if (error) {
    console.warn('[igdb] Supabase search failed, falling back to mock:', error)
    return searchMock(raw)
  }
  if (!data) return []
  return rerank((data as GameRow[]).map(rowToGame), raw)
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
