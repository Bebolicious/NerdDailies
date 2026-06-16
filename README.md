# DAILIES

Daily game-guessing hub. Five daily puzzles — **Screenshot**, **Trophy**,
**Blur Reveal**, **Soundtrack**, **Mini Crossword** — plus two weekly games
that refresh every Monday: **The Archive** (atmospheric clue-room) and
**Higher / Lower** (15-pair stat gauntlet with an Online Hot-seat multiplayer
mode). React + Vite + TypeScript, Tailwind v4, Supabase, neo-brutalist UI.

## Quick start

```
npm install
npm run dev      # http://localhost:5173
```

Without an `.env` configured the app uses a mock catalog + auto-generated
placeholder puzzles, so the UI is fully playable out of the box.

## Wire up Supabase

1. Create a Supabase project (you have an account — username `Bebolicious`).
2. In the SQL editor, paste and run `supabase/schema.sql`. This creates:
   - `screenshot_puzzles`, `trophy_puzzles`, `blur_puzzles`,
     `soundtrack_puzzles`, `crossword_puzzles` (keyed by `puzzle_date`).
   - `archive_puzzles`, `higherlower_puzzles` + `higherlower_pairs` (keyed
     by `puzzle_week` — Monday of the ISO week).
   - `screenshots`, `soundtracks`, `covers`, `archive`, `higherlower`
     public-read storage buckets.
   - RLS: public read, authenticated write.
3. In **Authentication → Users**, add your admin email/password.
4. Copy `.env.example` → `.env` and fill in:

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

5. Restart the dev server. Sign in at `/admin/login`.

The game pages already read from Supabase when configured and fall back to
mocks otherwise — no code change needed when you flip it on.

## Admin

- `/admin` — month calendar. Each day shows one chip per daily game type
  (screenshot / trophy / blur / soundtrack / crossword); Mondays also expose
  the two weekly game chips (archive / higher-lower). Filled = colored,
  empty = "+ add" / "+ week". Click a chip to open its editor. A row of
  quick-jump buttons at the bottom drops you straight into today's puzzles.
- `/admin/screenshot/:date` — pick game + upload 6 ordered images
  (slot 6 = easiest).
- `/admin/trophy/:date` — pick game + name/description/4 clues + optional
  rarity/platform/gamerscore.
- `/admin/blur/:date` — pick game + upload the official 3:4 cover; the
  client blurs/sharpens it per wrong guess.
- `/admin/soundtrack/:date` — pick game + upload one audio file + set the
  reveal-start in seconds. App slices into 1 / 4 / 8 / 15 / 30 / ALL windows
  on the client. Audio is auto-trimmed to 60s and re-encoded to MP3 on
  upload.
- `/admin/crossword/:date` — author the grid, mark blocks, and write across
  / down clues. Numbering is derived from the solution.
- `/admin/archive/:date` — snaps to the Monday of that week. Pick the
  mystery game, fill the 6 clues (year/genre/platform + pitch/memo/review),
  upload the radio clip + two wall frames + the chest's cropped logo, set
  the two mystery-box outcomes, and pick the trash crossed-out title.
- `/admin/higherlower/:date` — snaps to Monday. Per pair (15 by default):
  category dropdown, two `GamePicker` rows, numeric value, optional display
  override (`1:42:35` / `$220M` / `96%`), optional cover upload. ↑/↓ to
  reorder, trash to reset a row. Sticky save bar shows completion count.

## Game catalog

Searchable guess catalog is the `public.games` table in Supabase, populated
once by `scripts/import-igdb-games.mjs` (top 100 games per platform from
IGDB, ~1,500 unique titles after dedupe). To re-pull or refresh:

```
node --env-file=.env scripts/import-igdb-games.mjs   # writes supabase/seed-games.sql
# then paste supabase/seed-games.sql into the Supabase SQL editor
```

Requires `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in `.env` (server-side
only — never prefix with `VITE_`). The script exchanges these for a fresh
access token on every run.

When `.env` isn't configured, search falls back to the 60-game
`src/data/mockCatalog.ts` so the UI stays playable.

## Plan for later (not done yet)

- **Netlify deploy.** Standard Vite build (`npm run build` → `dist/`). Add
  the Supabase env vars to the Netlify project. SPA redirect: add a
  `public/_redirects` file with `/*  /index.html  200`.
- **Share-result buttons** are placed but no-op. Wire `navigator.clipboard`
  with an emoji grid when you want them.

## Layout

```
src/
  App.tsx                       routes
  components/
    layout/   NavBar, TodaySidebar (with Weekly box), ShellLayout
    ui/       NeoCard, NeoButton, TagPill, GuessSlots, GuestBanner,
              InfoButton, SubmitterField, PixelLogo, SettingsModal
    game/     GameSearch, GamePicker, GuessRow, GameHeader, SoundtrackPlayer
  pages/
    ScreenshotGame, TrophyGame, BlurGame, SoundtrackGame,
    CrosswordGame, ArchiveGame, HigherLowerGame
    HowToPlay, Stats, Replay
    admin/
      AdminLogin, AdminDashboard, AdminLayout,
      ScreenshotEditor, TrophyEditor, BlurEditor, SoundtrackEditor,
      CrosswordEditor, ArchiveEditor, HigherLowerEditor
  hooks/
    useGameState, useCountdown, useStreak, useAdminSession, usePuzzle,
    useReadability, useTheme
  lib/
    cn, dates, types, supabase, puzzleStore, gamedb, scoreStore,
    franchise, audioTrim
  data/
    mockCatalog, mockPuzzles
supabase/
  schema.sql
```

## Notes

- Local-only scores: `localStorage` key `dailies/results/v1`. Higher/Lower
  also stores a per-week session at `dailies/higherlower-session/v1/<week>`
  (host + multiplayer roster + per-pair picks); only the host's score is
  mirrored to the global results map.
- Day numbering anchored to `PROJECT_EPOCH` in `src/lib/dates.ts` — change
  the date there if you want day #1 to fall on a different day.
- Streak = consecutive days with at least one puzzle solved.
- Weekly games are keyed by the Monday of their ISO week
  (`weekStartISO` / `weekNumber` in `src/lib/dates.ts`).
- Higher/Lower's Online Hot-seat mode is single-client: the host shares
  their screen (Discord etc.) and clicks for each player. Only the host's
  score saves to the daily streak; everyone else plays for bragging rights.
