// One-shot importer: pulls the top 100 games per platform from IGDB
// (sorted by total_rating_count desc) and writes an idempotent SQL seed
// file you can paste into the Supabase SQL editor.
//
// Run:
//   node --env-file=.env scripts/import-igdb-games.mjs
//
// Output:
//   supabase/seed-games.sql
//
// Requirements (.env, server-side only — no VITE_ prefix):
//   IGDB_CLIENT_ID
//   IGDB_CLIENT_SECRET   (preferred — script exchanges for a fresh token every run)
//   IGDB_ACCESS_TOKEN    (fallback if secret isn't set — must be a current token)

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLIENT_ID = process.env.IGDB_CLIENT_ID
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET
const STATIC_TOKEN = process.env.IGDB_ACCESS_TOKEN

if (!CLIENT_ID) {
  console.error('Missing IGDB_CLIENT_ID in .env')
  process.exit(1)
}
if (!CLIENT_SECRET && !STATIC_TOKEN) {
  console.error('Need IGDB_CLIENT_SECRET (preferred) or IGDB_ACCESS_TOKEN in .env')
  process.exit(1)
}

async function getAccessToken() {
  if (CLIENT_SECRET) {
    const url = new URL('https://id.twitch.tv/oauth2/token')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('client_secret', CLIENT_SECRET)
    url.searchParams.set('grant_type', 'client_credentials')
    const res = await fetch(url, { method: 'POST' })
    if (!res.ok) {
      throw new Error(`Twitch token exchange ${res.status}: ${await res.text()}`)
    }
    const { access_token, expires_in } = await res.json()
    const days = Math.round(expires_in / 86400)
    console.log(`Got fresh token (expires in ~${days} days)\n`)
    return access_token
  }
  console.log('Using IGDB_ACCESS_TOKEN from .env (no IGDB_CLIENT_SECRET set)\n')
  return STATIC_TOKEN
}

let ACCESS_TOKEN

// Curated list. IGDB platform IDs are stable (these match values returned
// from /v4/platforms). Order here is just for log readability.
const PLATFORMS = [
  { id: 6,   label: 'PC' },
  { id: 7,   label: 'PS1' },
  { id: 8,   label: 'PS2' },
  { id: 9,   label: 'PS3' },
  { id: 48,  label: 'PS4' },
  { id: 167, label: 'PS5' },
  { id: 11,  label: 'Xbox' },
  { id: 12,  label: 'Xbox 360' },
  { id: 49,  label: 'Xbox One' },
  { id: 169, label: 'Xbox Series' },
  { id: 130, label: 'Switch' },
  { id: 41,  label: 'Wii U' },
  { id: 5,   label: 'Wii' },
  { id: 21,  label: 'GameCube' },
  { id: 4,   label: 'N64' },
  { id: 19,  label: 'SNES' },
  { id: 18,  label: 'NES' },
  { id: 33,  label: 'Game Boy' },
  { id: 24,  label: 'GBA' },
  { id: 20,  label: 'DS' },
  { id: 37,  label: '3DS' },
  { id: 29,  label: 'Genesis' },
  { id: 23,  label: 'Dreamcast' },
  { id: 52,  label: 'Arcade' },
  { id: 39,  label: 'iOS' },
]

const IGDB_URL = 'https://api.igdb.com/v4/games'

// Pages of 100 to pull per platform. 2 = top 200, 3 = top 300, etc.
// Each platform incurs PAGES extra API calls (sequential, well under the
// 4 req/sec rate limit).
const PAGES = 2

async function fetchTopGamesForPlatform(platformId, page) {
  // APICalypse query:
  //   - game_type = 0  → main games only (skips DLC, expansions, bundles).
  //     (Was `category` in older IGDB v4 — renamed to game_type.)
  //   - version_parent = null → skips re-releases / "Game of the Year" editions
  //   - sort by number of user ratings = "most well-known" proxy
  //   - offset paginates: page 0 = top 100, page 1 = ranks 100-199, etc.
  const body = `
    fields name, first_release_date, genres.name, platforms.abbreviation;
    where platforms = (${platformId})
      & game_type = 0
      & version_parent = null
      & total_rating_count != null;
    sort total_rating_count desc;
    limit 100;
    offset ${page * 100};
  `.trim()

  const res = await fetch(IGDB_URL, {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'text/plain',
      Accept: 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`IGDB ${res.status} for platform ${platformId}: ${text}`)
  }

  return res.json()
}

function shapeGame(raw) {
  const year = raw.first_release_date
    ? new Date(raw.first_release_date * 1000).getUTCFullYear()
    : null
  const genre = raw.genres?.[0]?.name ?? null
  const platforms = (raw.platforms ?? [])
    .map((p) => p.abbreviation)
    .filter(Boolean)
  return {
    id: raw.id,
    name: raw.name,
    year,
    genre,
    platforms,
  }
}

function sqlString(v) {
  if (v == null) return 'null'
  return `'${String(v).replace(/'/g, "''")}'`
}

function sqlInt(v) {
  return v == null ? 'null' : String(v)
}

function sqlTextArray(arr) {
  if (!arr || arr.length === 0) return `'{}'`
  // Postgres array literal: {"a","b"} — escape backslashes and quotes inside.
  const escaped = arr.map(
    (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  )
  return `'{${escaped.join(',')}}'`
}

function gameToValues(g) {
  return `(${sqlInt(g.id)}, ${sqlString(g.name)}, ${sqlInt(g.year)}, ${sqlString(g.genre)}, ${sqlTextArray(g.platforms)})`
}

async function main() {
  ACCESS_TOKEN = await getAccessToken()

  const byId = new Map()
  let totalFetched = 0

  for (const { id, label } of PLATFORMS) {
    for (let page = 0; page < PAGES; page++) {
      process.stdout.write(`  ${label.padEnd(14)} p${page} → `)
      const raw = await fetchTopGamesForPlatform(id, page)
      totalFetched += raw.length
      let added = 0
      for (const r of raw) {
        const shaped = shapeGame(r)
        if (!byId.has(shaped.id)) {
          byId.set(shaped.id, shaped)
          added++
        }
      }
      console.log(`${raw.length} games (+${added} new, total ${byId.size})`)
    }
  }

  const games = [...byId.values()].sort((a, b) => a.id - b.id)
  console.log(
    `\n${games.length} unique games (${totalFetched} fetched, ${totalFetched - games.length} dedup'd)`,
  )

  const header = [
    '-- Generated by scripts/import-igdb-games.mjs',
    '-- Top 100 games per curated platform, sorted by IGDB total_rating_count.',
    "-- Paste into the Supabase SQL editor after running schema.sql.",
    '',
    'insert into public.games (id, name, year, genre, platforms) values',
  ].join('\n')

  const body = games.map(gameToValues).join(',\n  ')

  const tail = `
on conflict (id) do update set
  name      = excluded.name,
  year      = excluded.year,
  genre     = excluded.genre,
  platforms = excluded.platforms;
`.trimStart()

  const sql = `${header}\n  ${body}\n${tail}`

  const here = dirname(fileURLToPath(import.meta.url))
  const outPath = resolve(here, '..', 'supabase', 'seed-games.sql')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, sql, 'utf8')
  console.log(`\nWrote ${outPath}`)
  console.log('Next: open the Supabase SQL editor and paste this file.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
