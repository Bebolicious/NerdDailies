import Fuse from 'fuse.js'
import { getSupabase } from './supabase'
import { MOCK_CATALOG } from '../data/mockCatalog'
import type { Game } from './types'

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

const DISPLAY_LIMIT = 20
const CANDIDATE_LIMIT = 60
// Word-boundary pass: rows where a token is an actual word in the name. Short
// or common substrings ("rv") would otherwise be drowned out by the broad
// substring pass (Marvel, Survivors, Curveball …) and pushed past the cap.
const WORD_BOUNDARY_LIMIT = 30

type GameRow = {
  id: number
  name: string
  year: number | null
  genre: string | null
  platforms: string[] | null
}

function rowToGame(row: GameRow): Game {
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
  // Without this, Fuse penalizes longer titles by token count — so "Resident
  // Evil: Revelations 2" (4 tokens) ranks below "Resident Evil: Revelations"
  // (3 tokens) for the query "resident evil", even though both are exact
  // substring matches. Treat every exact match as equally good and let
  // candidate order be the tiebreaker.
  ignoreFieldNorm: true,
  includeScore: false,
  minMatchCharLength: 2,
  useExtendedSearch: false,
}

function rerank(candidates: Game[], query: string): Game[] {
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

// Possessive 's appears in tons of game titles (Tom Clancy's, Marvel's,
// Hell's Kitchen, Assassin's Creed, Luigi's Mansion). Players type without
// the apostrophe, so for any token ending in `s` we also try the `…'s` form
// when building DB patterns.
function tokenVariants(t: string): string[] {
  if (t.length >= 3 && t.endsWith('s')) {
    return [t, `${t.slice(0, -1)}'s`]
  }
  return [t]
}

function searchMock(rawQuery: string): Game[] {
  return rerank([...MOCK_CATALOG], rawQuery)
}

export async function searchGames(query: string): Promise<Game[]> {
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
  const subFilter =
    tokens.length > 0
      ? tokens
          .flatMap((t) => tokenVariants(t).map((v) => `name.ilike.%${escapeIlike(v)}%`))
          .join(',')
      : `name.ilike.%${escapeIlike(raw.toLowerCase())}%`

  // Word-boundary clauses: token at start of name or after a space. Ensures
  // rows like "RV There Yet?" survive when the substring pass is saturated by
  // unrelated names that happen to contain the same letters.
  const wbFilter = tokens
    .flatMap((t) =>
      tokenVariants(t).flatMap((v) => {
        const e = escapeIlike(v)
        return [`name.ilike.${e}%`, `name.ilike.% ${e}%`]
      }),
    )
    .join(',')

  const select = 'id,name,year,genre,platforms'

  // AND pass: every token must appear as a substring of the name. This is what
  // reliably surfaces multi-word titles whose individual tokens are common
  // ("god of war", "the legend of zelda") — a stopword-ish token like "of"
  // saturates the OR-based passes below, so without relevance ordering the real
  // match gets pushed past the LIMIT before it can be reranked. Tokens are
  // alphanumeric-only (see tokenize), so no ILIKE escaping is needed here.
  let andQuery = null
  if (tokens.length >= 2) {
    let q = sb.from('games').select(select)
    for (const t of tokens) {
      q = q.ilike('name', `%${t}%`)
    }
    andQuery = q.limit(WORD_BOUNDARY_LIMIT)
  }

  const [andRes, subRes, wbRes] = await Promise.all([
    andQuery,
    sb.from('games').select(select).or(subFilter).limit(CANDIDATE_LIMIT),
    wbFilter
      ? sb.from('games').select(select).or(wbFilter).limit(WORD_BOUNDARY_LIMIT)
      : null,
  ])

  if (subRes.error) {
    console.warn('[gamedb] Supabase search failed, falling back to mock:', subRes.error)
    return searchMock(raw)
  }
  if (wbRes?.error) {
    console.warn('[gamedb] Supabase word-boundary search failed, falling back to mock:', wbRes.error)
    return searchMock(raw)
  }
  if (andRes?.error) {
    console.warn('[gamedb] Supabase all-tokens search failed, falling back to mock:', andRes.error)
    return searchMock(raw)
  }

  const seen = new Set<number>()
  const merged: Game[] = []
  for (const row of [
    ...((andRes?.data ?? []) as GameRow[]),
    ...((wbRes?.data ?? []) as GameRow[]),
    ...((subRes.data ?? []) as GameRow[]),
  ]) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      merged.push(rowToGame(row))
    }
  }
  // Alphabetical pre-sort so that Fuse ties (e.g. every "Resident Evil ..."
  // title scoring identically) resolve in a predictable order — series
  // entries appear adjacent rather than in arbitrary DB return order.
  merged.sort((a, b) => a.name.localeCompare(b.name))
  return rerank(merged, raw)
}

export async function getGameById(id: number): Promise<Game | null> {
  const sb = getSupabase()
  if (!sb) return MOCK_CATALOG.find((g) => g.id === id) ?? null

  const { data, error } = await sb
    .from('games')
    .select('id,name,year,genre,platforms')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.warn('[gamedb] Supabase getById failed, falling back to mock:', error)
    return MOCK_CATALOG.find((g) => g.id === id) ?? null
  }
  return data ? rowToGame(data as GameRow) : null
}
