import Fuse from 'fuse.js'
import { getSupabase } from './supabase'
import { MOCK_CATALOG } from '../data/mockCatalog'
import type { Game } from './types'

// Catalog search for the player guess input and admin GamePicker.
//
// The `public.games` table is small (~7.6k rows / ~0.6 MB) and effectively
// static — it only changes when the IGDB import script is re-run. So instead of
// hitting PostgREST on every keystroke (which fired up to 3 multi-row queries
// per search and was the dominant source of REST egress — heavily amplified by
// tour mode routing each visitor through several search-enabled games), we load
// the whole catalog *once* and search it entirely client-side with Fuse.
//
//   • First search of a session → one paginated fetch, cached in memory + in
//     localStorage (versioned, 7-day TTL). Returning visitors reuse the cached
//     copy and cost zero egress until the version is bumped or the TTL lapses.
//   • Every subsequent search → pure client-side Fuse, no network at all.
//   • Before trusting a cached copy, one `head: true` row-count request checks
//     whether the table grew/shrank since the cache was written. That returns no
//     rows (a few bytes of headers), so it costs effectively nothing, and it
//     means a game added by hand in the SQL editor shows up on the next page
//     load instead of whenever the 7-day TTL happens to lapse.
//
// Fuse over the full catalog also gives strictly better recall than the old
// LIMIT-capped DB candidate passes, which could drop relevant rows before the
// re-rank ever saw them.
//
// No `.env` (mock mode) uses the mock catalog through the same Fuse path so
// behavior matches the cloud path.

const DISPLAY_LIMIT = 20

// Bump when the catalog *content* changes in a way the row-count check can't
// see — a rename, a year/genre correction, or an add+delete that nets to zero.
// Pure additions and deletions don't need a bump; the count check catches those.
const CATALOG_VERSION = 1
const CATALOG_CACHE_KEY = 'dailies/games-catalog/v1'
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// PostgREST caps a single response at 1000 rows, so the one-time load pages
// through with `.range()` until a short page signals the end.
const PAGE_SIZE = 1000

type GameRow = {
  id: number
  name: string
  year: number | null
  genre: string | null
}

function rowToGame(row: GameRow): Game {
  return {
    id: row.id,
    name: row.name,
    year: row.year ?? undefined,
    genre: row.genre ?? undefined,
  }
}

const FUSE_OPTIONS = {
  keys: ['name'],
  threshold: 0.4,
  ignoreLocation: true,
  // Without this, Fuse penalizes longer titles by token count — so "Resident
  // Evil: Revelations 2" (4 tokens) ranks below "Resident Evil: Revelations"
  // (3 tokens) for the query "resident evil", even though both are exact
  // substring matches. Treat every exact match as equally good and let the
  // (alphabetical) catalog order be the tiebreaker.
  ignoreFieldNorm: true,
  includeScore: false,
  minMatchCharLength: 2,
  useExtendedSearch: false,
}

// ── one-time catalog load (cached) ───────────────────────────────────────────

// Dedupes concurrent and repeat loads within a session. Once resolved, every
// search reuses this same array — no further network.
let catalogPromise: Promise<Game[]> | null = null
// Fuse index built once per resolved catalog (identity-keyed so a mock→cloud
// swap rebuilds, but repeated searches over the same array don't).
let fuseCache: { games: Game[]; fuse: Fuse<Game> } | null = null

function sortedMock(): Game[] {
  return [...MOCK_CATALOG].sort((a, b) => a.name.localeCompare(b.name))
}

function readCachedCatalog(): Game[] | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v: number; at: number; games: Game[] }
    if (parsed.v !== CATALOG_VERSION) return null
    if (Date.now() - parsed.at > CATALOG_TTL_MS) return null
    if (!Array.isArray(parsed.games) || parsed.games.length === 0) return null
    return parsed.games
  } catch {
    return null
  }
}

function writeCachedCatalog(games: Game[]) {
  try {
    localStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({ v: CATALOG_VERSION, at: Date.now(), games }),
    )
  } catch {
    // Quota exceeded or storage disabled — non-fatal, we just re-fetch next
    // session.
  }
}

// Row count only — `head: true` sends no rows back, so this is the cheapest
// possible "is my cache still current?" probe. Returns null when the request
// fails, which the caller reads as "can't tell, keep the cache".
async function fetchCatalogCount(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
): Promise<number | null> {
  const { count, error } = await sb
    .from('games')
    .select('id', { count: 'exact', head: true })
  if (error) {
    console.warn('[gamedb] catalog count check failed, trusting cache:', error)
    return null
  }
  return count ?? null
}

async function fetchAllGames(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
): Promise<Game[]> {
  const out: Game[] = []
  // Ordering by name in the DB gives the alphabetical pre-sort for free, so
  // Fuse ties (e.g. every "Resident Evil ..." scoring identically) resolve in a
  // predictable, series-adjacent order.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('games')
      .select('id,name,year,genre')
      .order('name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as GameRow[]
    for (const r of rows) out.push(rowToGame(r))
    if (rows.length < PAGE_SIZE) break
  }
  return out
}

function loadCatalog(): Promise<Game[]> {
  if (catalogPromise) return catalogPromise
  catalogPromise = (async () => {
    const sb = getSupabase()
    if (!sb) return sortedMock()

    const cached = readCachedCatalog()
    if (cached) {
      const count = await fetchCatalogCount(sb)
      // null ⇒ the probe itself failed (offline, RLS hiccup); a stale catalog
      // beats no catalog, so keep it. Otherwise a changed row count means rows
      // were added or removed since we cached, and we fall through to a refetch.
      if (count === null || count === cached.length) return cached
    }

    try {
      const games = await fetchAllGames(sb)
      if (games.length === 0) throw new Error('empty catalog')
      writeCachedCatalog(games)
      return games
    } catch (err) {
      console.warn('[gamedb] catalog load failed, falling back to mock:', err)
      // Clear so a later search retries the network instead of being stuck on
      // the mock catalog for the rest of the session.
      catalogPromise = null
      return sortedMock()
    }
  })()
  return catalogPromise
}

async function getFuse(): Promise<Fuse<Game>> {
  const games = await loadCatalog()
  if (!fuseCache || fuseCache.games !== games) {
    fuseCache = { games, fuse: new Fuse(games, FUSE_OPTIONS) }
  }
  return fuseCache.fuse
}

// ── public API ───────────────────────────────────────────────────────────────

export async function searchGames(query: string): Promise<Game[]> {
  const raw = query.trim()
  if (!raw) return []
  const fuse = await getFuse()
  return fuse.search(raw, { limit: DISPLAY_LIMIT }).map((h) => h.item)
}

export async function getGameById(id: number): Promise<Game | null> {
  const catalog = await loadCatalog()
  const hit = catalog.find((g) => g.id === id)
  if (hit) return hit

  // Not in the loaded catalog (mock mode, or an id outside the cached set).
  // Fall back to a cheap single-row lookup before giving up.
  const sb = getSupabase()
  if (!sb) return MOCK_CATALOG.find((g) => g.id === id) ?? null
  const { data, error } = await sb
    .from('games')
    .select('id,name,year,genre')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.warn('[gamedb] getById failed, falling back to mock:', error)
    return MOCK_CATALOG.find((g) => g.id === id) ?? null
  }
  return data ? rowToGame(data as GameRow) : null
}
