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

import { writeFile, readFile, mkdir } from 'node:fs/promises'
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
// from /v4/platforms). `newer` = released after SNES (1990) — used by
// --extend mode to skip retro platforms when pulling deeper ranks.
// `current: true` = a platform still selling new releases today. Used by
// --year mode to pull a year's worth of releases for the current generation
// only (current consoles + PC), including titles not out yet.
const PLATFORMS = [
  { id: 6,   label: 'PC',          newer: true,  current: true },
  { id: 7,   label: 'PS1',         newer: true  },
  { id: 8,   label: 'PS2',         newer: true  },
  { id: 9,   label: 'PS3',         newer: true  },
  { id: 48,  label: 'PS4',         newer: true  },
  { id: 167, label: 'PS5',         newer: true,  current: true },
  { id: 11,  label: 'Xbox',        newer: true  },
  { id: 12,  label: 'Xbox 360',    newer: true  },
  { id: 49,  label: 'Xbox One',    newer: true  },
  { id: 169, label: 'Xbox Series', newer: true,  current: true },
  { id: 130, label: 'Switch',      newer: true,  current: true },
  { id: 41,  label: 'Wii U',       newer: true  },
  { id: 5,   label: 'Wii',         newer: true  },
  { id: 21,  label: 'GameCube',    newer: true  },
  { id: 4,   label: 'N64',         newer: true  },
  { id: 19,  label: 'SNES',        newer: false },
  { id: 18,  label: 'NES',         newer: false },
  { id: 33,  label: 'Game Boy',    newer: false },
  { id: 24,  label: 'GBA',         newer: true  },
  { id: 20,  label: 'DS',          newer: true  },
  { id: 37,  label: '3DS',         newer: true  },
  { id: 29,  label: 'Genesis',     newer: false },
  { id: 23,  label: 'Dreamcast',   newer: true  },
  { id: 52,  label: 'Arcade',      newer: false },
  { id: 39,  label: 'iOS',         newer: true  },
]

const IGDB_URL = 'https://api.igdb.com/v4/games'

// Default mode: fetch pages 0-1 (top 200) for every platform, overwrite seed.
// --extend mode: fetch a range of pages for `newer` platforms only and append
// a new INSERT block to the existing seed file. Used to deepen the catalog
// without re-pulling retro consoles. Defaults to pages 2-4 (ranks 200-499);
// override with `--start=N` / `--count=N` to pull a different range (e.g.
// `--extend --start=5 --count=2` pulls ranks 500-699). Existing IDs in the
// seed file are skipped so each row appears only once.
const EXTEND = process.argv.includes('--extend')
function cliInt(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`))
  return arg ? Number(arg.slice(flag.length + 1)) : fallback
}
// --year=YYYY mode: pull the top ~100 games released (or scheduled to release)
// in calendar year YYYY for current-gen platforms only, ranked by anticipation
// (`hypes`) so unreleased-but-upcoming titles are included. Appends to the seed
// and skips ids already present, like --extend.
const YEAR = cliInt('--year', null)
const APPEND = EXTEND || YEAR != null
const PAGE_START = EXTEND ? cliInt('--start', 2) : 0
const PAGE_COUNT = YEAR != null ? 1 : EXTEND ? cliInt('--count', 3) : 2

async function fetchTopGamesForPlatform(platformId, page) {
  if (YEAR != null) {
    // Release window for the target year, in unix seconds (UTC). Sorting by
    // `hypes` (number of users anticipating) ranks both already-released hits
    // and not-yet-out titles, unlike total_rating_count which only exists once
    // a game has been rated.
    const start = Date.UTC(YEAR, 0, 1) / 1000
    const end = Date.UTC(YEAR + 1, 0, 1) / 1000
    const yearBody = `
      fields name, first_release_date, genres.name, platforms.abbreviation;
      where platforms = (${platformId})
        & game_type = 0
        & version_parent = null
        & first_release_date >= ${start}
        & first_release_date < ${end}
        & hypes != null;
      sort hypes desc;
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
      body: yearBody,
    })
    if (!res.ok) {
      throw new Error(`IGDB ${res.status} for platform ${platformId}: ${await res.text()}`)
    }
    return res.json()
  }

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

  const platforms =
    YEAR != null
      ? PLATFORMS.filter((p) => p.current)
      : EXTEND
        ? PLATFORMS.filter((p) => p.newer)
        : PLATFORMS
  if (YEAR != null) {
    console.log(
      `--year=${YEAR}: pulling top 100 ${YEAR} releases (by hypes) for ${platforms.length} current platforms: ${platforms.map((p) => p.label).join(', ')}\n`,
    )
  } else if (EXTEND) {
    console.log(
      `--extend: pulling pages ${PAGE_START}-${PAGE_START + PAGE_COUNT - 1} for ${platforms.length} newer platforms\n`,
    )
  }

  // In --extend, skip game IDs already in the seed file so the new block can
  // be appended without producing duplicate rows. Without this, IGDB rank
  // drift between runs (a game at rank 499 last month could be at 502 today)
  // would re-emit the same id in two blocks.
  const here = dirname(fileURLToPath(import.meta.url))
  const outPath = resolve(here, '..', 'supabase', 'seed-games.sql')
  const existingIds = new Set()
  if (APPEND) {
    const existing = await readFile(outPath, 'utf8').catch(() => '')
    for (const m of existing.matchAll(/^\s*\((\d+),/gm)) {
      existingIds.add(Number(m[1]))
    }
    console.log(`Seed already has ${existingIds.size} rows — those ids will be skipped\n`)
  }

  const byId = new Map()
  let totalFetched = 0
  let skippedExisting = 0

  for (const { id, label } of platforms) {
    for (let i = 0; i < PAGE_COUNT; i++) {
      const page = PAGE_START + i
      process.stdout.write(`  ${label.padEnd(14)} p${page} → `)
      const raw = await fetchTopGamesForPlatform(id, page)
      totalFetched += raw.length
      let added = 0
      for (const r of raw) {
        const shaped = shapeGame(r)
        if (existingIds.has(shaped.id)) {
          skippedExisting++
          continue
        }
        if (!byId.has(shaped.id)) {
          byId.set(shaped.id, shaped)
          added++
        }
      }
      console.log(`${raw.length} games (+${added} new, total ${byId.size})`)
    }
  }

  const games = [...byId.values()].sort((a, b) => a.id - b.id)
  const dedupRun = totalFetched - games.length - skippedExisting
  console.log(
    `\n${games.length} new games (${totalFetched} fetched, ${dedupRun} within-run dups, ${skippedExisting} already in seed)`,
  )

  const header = YEAR != null
    ? [
        '',
        `-- Year: top ${YEAR} releases (by hypes) for current platforms (${platforms.map((p) => p.label).join(', ')}).`,
        `-- Appended ${new Date().toISOString().slice(0, 10)} by scripts/import-igdb-games.mjs --year=${YEAR}`,
        'insert into public.games (id, name, year, genre, platforms) values',
      ].join('\n')
    : EXTEND
    ? [
        '',
        `-- Extend: pages ${PAGE_START}-${PAGE_START + PAGE_COUNT - 1} (ranks ${PAGE_START * 100}-${(PAGE_START + PAGE_COUNT) * 100 - 1}) for platforms newer than SNES.`,
        `-- Appended ${new Date().toISOString().slice(0, 10)} by scripts/import-igdb-games.mjs --extend`,
        'insert into public.games (id, name, year, genre, platforms) values',
      ].join('\n')
    : [
        '-- Generated by scripts/import-igdb-games.mjs',
        '-- Top 100 games per curated platform, sorted by IGDB total_rating_count.',
        '-- Paste into the Supabase SQL editor after running schema.sql.',
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

  await mkdir(dirname(outPath), { recursive: true })

  if (APPEND) {
    if (games.length === 0) {
      console.log('\nNo new games to append — seed file unchanged.')
    } else {
      const existing = await readFile(outPath, 'utf8')
      await writeFile(outPath, existing.trimEnd() + '\n' + sql, 'utf8')
      console.log(`\nAppended ${games.length} rows to ${outPath}`)
    }
  } else {
    await writeFile(outPath, sql, 'utf8')
    console.log(`\nWrote ${outPath}`)
  }
  console.log('Next: open the Supabase SQL editor and paste this file.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
