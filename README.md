# DAILIES

Daily game-guessing hub with three modes: Screenshot, Trophy, Soundtrack.
React + Vite + TypeScript, Tailwind v4, Supabase, neo-brutalist UI.

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
   - `screenshot_puzzles`, `trophy_puzzles`, `soundtrack_puzzles` (keyed by
     `puzzle_date`).
   - `screenshots` and `soundtracks` public-read storage buckets.
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

- `/admin` — month calendar. Each day shows three small slots
  (screenshot / trophy / soundtrack). Filled = colored, empty = "+ add".
  Click a slot to open its editor.
- `/admin/screenshot/:date` — pick game + upload 6 ordered images
  (slot 6 = easiest).
- `/admin/trophy/:date` — pick game + name/description/4 clues + optional
  rarity/platform/gamerscore.
- `/admin/soundtrack/:date` — pick game + upload one audio file + set the
  reveal-start in seconds. App slices into 2 / 4 / 8 / 15 / 30 / ALL windows
  on the client.

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
    layout/   NavBar, TodaySidebar, ShellLayout
    ui/       NeoCard, NeoButton, TagPill, GuessSlots, PixelLogo
    game/     GameSearch, GamePicker, GuessRow, GameHeader, SoundtrackPlayer
  pages/
    ScreenshotGame.tsx, TrophyGame.tsx, SoundtrackGame.tsx
    HowToPlay.tsx, Stats.tsx
    admin/
      AdminLogin, AdminDashboard, AdminLayout,
      ScreenshotEditor, TrophyEditor, SoundtrackEditor
  hooks/
    useGameState, useCountdown, useStreak, useAdminSession, usePuzzle
  lib/
    cn, dates, types, supabase, puzzleStore, gamedb, scoreStore
  data/
    mockCatalog, mockPuzzles
supabase/
  schema.sql
```

## Notes

- Local-only scores: `localStorage` key `dailies/results/v1`.
- Day numbering anchored to `PROJECT_EPOCH` in `src/lib/dates.ts` — change
  the date there if you want day #1 to fall on a different day.
- Streak = consecutive days with at least one puzzle solved.
