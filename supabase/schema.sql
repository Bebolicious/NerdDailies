-- Run this in the Supabase SQL editor (Project → SQL → New query).
-- Safe to re-run: uses "if not exists" everywhere.

-- ── EXTENSIONS ──────────────────────────────────────────────────────────────
-- pg_trgm enables fast substring/ILIKE searches on the games catalog via a
-- GIN index, so the searchable guess field stays snappy at any catalog size.

create extension if not exists pg_trgm;

-- ── TABLES ──────────────────────────────────────────────────────────────────

-- Catalog of guessable games. Populated by scripts/import-igdb-games.mjs
-- from IGDB. Primary key uses IGDB's stable game id so puzzles can reference
-- games by id without breaking when the catalog is re-imported.
create table if not exists public.games (
  id bigint primary key,
  name text not null,
  year int,
  genre text,
  platforms text[] not null default '{}',
  created_at timestamptz default now()
);

create index if not exists games_name_trgm_idx
  on public.games using gin (name gin_trgm_ops);



create table if not exists public.screenshot_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  game_id bigint not null,
  game_name text not null,
  game_year int,
  game_genre text,
  image_paths text[] not null,            -- ordered, 6 paths in the 'screenshots' bucket
  cover_path text,                        -- optional path in the 'covers' bucket
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.screenshot_puzzles
  add column if not exists cover_path text;

-- Migrate older databases that still use the igdb_* column names.
do $$
declare
  t text;
  renames text[][] := array[
    array['igdb_game_id',    'game_id'],
    array['igdb_game_name',  'game_name'],
    array['igdb_game_year',  'game_year'],
    array['igdb_game_genre', 'game_genre']
  ];
begin
  foreach t in array array['screenshot_puzzles', 'trophy_puzzles', 'soundtrack_puzzles']
  loop
    for i in 1 .. array_length(renames, 1) loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = t
          and column_name = renames[i][1]
      ) then
        execute format(
          'alter table public.%I rename column %I to %I',
          t, renames[i][1], renames[i][2]
        );
      end if;
    end loop;
  end loop;
end $$;

create table if not exists public.trophy_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  game_id bigint not null,
  game_name text not null,
  game_year int,
  game_genre text,
  trophy_name text not null,
  trophy_description text not null,
  clues text[] not null default '{}',     -- up to 4 strings
  rarity_pct numeric,
  platform text,
  gamerscore int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.blur_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  game_id bigint not null,
  game_name text not null,
  game_year int,
  game_genre text,
  cover_path text not null,               -- path in the 'covers' bucket; the
                                          -- client blurs/sharpens the official
                                          -- game cover per wrong guess
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Drop the old 'image_path' column (we now blur the official cover in-place
-- from the 'covers' bucket, so the separate blur_images path is redundant).
alter table public.blur_puzzles drop column if exists image_path;

-- Blur Reveal · Back Cover (hard mode). An optional second round on the same
-- day, enabled per-puzzle from the admin. Lives on this row rather than in its
-- own table so /blur stays a single query on the days it's switched off. The
-- answer is a DIFFERENT game from the front round.
alter table public.blur_puzzles add column if not exists backcover_enabled boolean not null default false;
alter table public.blur_puzzles add column if not exists backcover_path text;      -- path in the 'covers' bucket
alter table public.blur_puzzles add column if not exists backcover_game_id bigint;
alter table public.blur_puzzles add column if not exists backcover_game_name text;
alter table public.blur_puzzles add column if not exists backcover_game_year int;
alter table public.blur_puzzles add column if not exists backcover_game_genre text;

create table if not exists public.soundtrack_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  game_id bigint not null,
  game_name text not null,
  game_year int,
  game_genre text,
  audio_path text not null,               -- path in the 'soundtracks' bucket
  track_title text,
  reveal_start_seconds numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The weekly Archive game. Keyed by puzzle_week (Monday of the ISO week).
-- Three answers per week: two mystery games and a freehand "what do they have
-- in common" link. The room itself is authored as a flat `clues` jsonb list —
-- see src/lib/types.ts → ArchiveClue. Databases created before the rework get
-- the same shape via the alter blocks further down.
create table if not exists public.archive_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_week date not null unique,

  -- Subject A. Kept under the plain game_* names so the admin dashboard and
  -- Stats queries didn't have to change.
  game_id bigint not null,
  game_name text not null,
  game_year int,
  game_genre text,

  -- Subject B.
  game_b_id bigint,
  game_b_name text,
  game_b_year int,
  game_b_genre text,

  -- The link: a category preset, the prompt the player reads, the canonical
  -- answer, and any alternate spellings that should also be accepted.
  link_preset text,
  link_prompt text,
  link_answer text,
  link_accept text[],

  -- The whole room. Each entry carries its own container, emoji, name,
  -- subject, cost, placement and body (text / image path / audio path).
  clues jsonb not null default '[]'::jsonb,
  candles int not null default 7,

  weekly_theme text,
  trash_crossed_out text,                    -- optional crumpled wrong title

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The weekly Higher/Lower gauntlet. One row per week (Monday) holds the
-- puzzle metadata; the 15 pairs live in higherlower_pairs.
create table if not exists public.higherlower_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_week date not null unique,
  theme text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.higherlower_pairs (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references public.higherlower_puzzles(id) on delete cascade,
  position int not null check (position between 0 and 99),

  -- How this pair is played: 'vs' (two games), 'slider' (one game, guess the
  -- value), or 'auction' (a shelf of games, each player claims one). Free text
  -- so new types can ship without a migration; the player UI defaults
  -- unknown/missing values to 'vs'.
  pair_type text not null default 'vs',

  -- Stat the player is comparing. Free text so new categories can be added
  -- in the app without a migration; the player UI falls back gracefully.
  category text not null,

  game_a_id bigint not null,
  game_a_name text not null,
  game_a_year int,
  game_a_value numeric not null,
  game_a_display text,
  game_a_cover_path text,

  -- Side B is only populated for 'vs' pairs; nullable so single-game (slider)
  -- and auction rows can store just one game in the a/b columns.
  game_b_id bigint,
  game_b_name text,
  game_b_year int,
  game_b_value numeric,
  game_b_display text,
  game_b_cover_path text,

  -- The auction shelf: an ordered JSON array of
  --   { game_id, game_name, game_year, value, display, cover_path }
  -- with 2..10 entries. Only populated for pair_type = 'auction' (which also
  -- mirrors games[0] into the game_a_* columns, since those are NOT NULL).
  -- JSONB rather than a child table — the shelf is always read and written
  -- whole, same call the Archive's `clues` makes.
  games jsonb not null default '[]',

  created_at timestamptz default now(),
  unique (puzzle_id, position)
);

create index if not exists higherlower_pairs_puzzle_idx
  on public.higherlower_pairs (puzzle_id, position);

-- Migrate pre-existing databases: add the pair_type + games columns and relax
-- the (formerly NOT NULL) side-B columns so single-game pairs are allowed.
alter table public.higherlower_pairs
  add column if not exists pair_type text not null default 'vs';
alter table public.higherlower_pairs
  add column if not exists games jsonb not null default '[]';
alter table public.higherlower_pairs alter column game_b_id    drop not null;
alter table public.higherlower_pairs alter column game_b_name  drop not null;
alter table public.higherlower_pairs alter column game_b_value drop not null;

-- The 'piggyback' pair type was removed in favor of 'auction'. Old rows carry a
-- single game + its true value, which is exactly a slider round, so demote them
-- rather than deleting authored content.
update public.higherlower_pairs set pair_type = 'slider' where pair_type = 'piggyback';

-- The weekly mini-crossword. Keyed by puzzle_week (Monday of the ISO week).
-- No IGDB game reference — the puzzle is the answer. `solution` is a flat
-- row-major array; null entries are blocks. Clues are stored as JSON arrays of
-- {number, text}; numbering is derived client-side from the solution so the DB
-- stays small.
create table if not exists public.crossword_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_week date not null unique,          -- Monday of the ISO week
  size int not null check (size between 4 and 13),
  solution text[] not null,                  -- length = size*size; null = block
  clues_across jsonb not null default '[]'::jsonb,
  clues_down jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The daily Connections game. Keyed by puzzle_date.
-- 16 words split into 4 hidden groups of 4. `groups` holds the answer key
-- (category + words + difficulty); `layout` is the fixed shuffled board order
-- (16 words) generated at save time so every player sees the same arrangement.
create table if not exists public.connections_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  theme text,
  groups jsonb not null,                     -- [{difficulty,category,words[4]}] × 4
  layout text[] not null,                    -- 16 words in display order
  submitter text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── CADENCE SWAP migration ───────────────────────────────────────────────────
-- Crossword moved daily → weekly (now keyed by puzzle_week) and Connections
-- moved weekly → daily (now keyed by puzzle_date). On pre-existing databases,
-- rename the key column so its unique index follows along. Idempotent: only
-- fires when the old column is still present and the new one isn't.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'crossword_puzzles'
               and column_name = 'puzzle_date')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'crossword_puzzles'
               and column_name = 'puzzle_week') then
    alter table public.crossword_puzzles rename column puzzle_date to puzzle_week;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'connections_puzzles'
               and column_name = 'puzzle_week')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'connections_puzzles'
               and column_name = 'puzzle_date') then
    alter table public.connections_puzzles rename column puzzle_week to puzzle_date;
  end if;
end $$;

-- Crossword grid grew from 4–8 to 4–13. On pre-existing databases the old
-- size check constraint still caps at 8; drop it and re-add the wider bound.
-- Idempotent: the constraint name is Postgres's auto-generated default.
alter table public.crossword_puzzles
  drop constraint if exists crossword_puzzles_size_check;
alter table public.crossword_puzzles
  add constraint crossword_puzzles_size_check check (size between 4 and 13);

-- Community submitter credit. When set, the player UI renders a "GUEST · NAME"
-- corner banner on the puzzle. Optional on every game.
-- Trophy & Soundtrack also carry an optional official game cover (shown on the
-- uniform answer-reveal card). Path lives in the shared 'covers' bucket.
alter table public.trophy_puzzles     add column if not exists cover_path text;
alter table public.soundtrack_puzzles add column if not exists cover_path text;

alter table public.screenshot_puzzles add column if not exists submitter text;
alter table public.trophy_puzzles     add column if not exists submitter text;
alter table public.blur_puzzles       add column if not exists submitter text;
alter table public.soundtrack_puzzles add column if not exists submitter text;
alter table public.archive_puzzles    add column if not exists submitter text;
alter table public.crossword_puzzles  add column if not exists submitter text;
alter table public.higherlower_puzzles add column if not exists submitter text;
alter table public.connections_puzzles add column if not exists submitter text;

-- Per-puzzle theming. Optional on every game:
--   banner_text / banner_color → a custom corner banner that OVERRIDES the
--     "Submitted by" credit (e.g. a pink "Valentine's Day" banner). banner_color
--     is a comma-separated hex list: one value = solid, 2+ = stripes/gradient.
--   banner_text_color → optional hex list overriding the auto-contrast text
--     color (2+ values = a gradient text fill).
--   banner_style → 'stripes' | 'gradient' — how a multi-color banner_color
--     renders (hard flag bands vs a smooth blend). Defaults to stripes.
--   effect_type  → 'falling' | 'rising' | 'confetti' | 'vignette' — a
--     full-viewport celebration shown once the round finishes.
--   effect_emoji → the particle glyph (e.g. ❤️).
--   effect_color → hex list for the transparent→color vignette overlay (2+ = a
--     multi-hue radial glow).
do $$
declare t text;
begin
  foreach t in array array[
    'screenshot_puzzles','trophy_puzzles','blur_puzzles','soundtrack_puzzles',
    'archive_puzzles','crossword_puzzles','higherlower_puzzles','connections_puzzles'
  ] loop
    execute format('alter table public.%I add column if not exists banner_text       text', t);
    execute format('alter table public.%I add column if not exists banner_color      text', t);
    execute format('alter table public.%I add column if not exists banner_text_color text', t);
    execute format('alter table public.%I add column if not exists banner_style      text', t);
    execute format('alter table public.%I add column if not exists effect_type       text', t);
    execute format('alter table public.%I add column if not exists effect_emoji      text', t);
    execute format('alter table public.%I add column if not exists effect_color      text', t);
  end loop;
end $$;

-- ── Archive rework: two games + a freehand link, and an authored clue list ──
--
-- The Archive used to have exactly one answer and a fixed room (3 shelf boxes,
-- 3 drawers, 2 frames, 1 chest — each its own column). One lucky clue ended the
-- week in seconds, and no week could deviate from that shape.
--
-- Now: THREE answers (game A, game B, and a freehand "what do they have in
-- common"), and the whole room lives in `clues` jsonb — a flat list where each
-- entry carries its own container, emoji, name, subject, cost and body. See
-- src/lib/types.ts → ArchiveClue.
--
-- game_id / game_name / game_year / game_genre stay as subject A so the admin
-- dashboard and stats keep working unchanged.
alter table public.archive_puzzles
  add column if not exists game_b_id    bigint,
  add column if not exists game_b_name  text,
  add column if not exists game_b_year  int,
  add column if not exists game_b_genre text,
  add column if not exists link_preset  text,
  add column if not exists link_prompt  text,
  add column if not exists link_answer  text,
  add column if not exists link_accept  text[],
  add column if not exists clues        jsonb not null default '[]'::jsonb,
  add column if not exists candles      int not null default 7;

-- The old fixed-room columns become optional. They're no longer written or
-- read by the app; dropping NOT NULL is what lets the new editor save a row
-- without inventing values for a shape that no longer exists.
do $$
declare c text;
begin
  foreach c in array array[
    'clue_year','clue_genre','clue_platform','clue_pitch','clue_memo',
    'clue_review','frame1_path','frame2_path','chest_logo_path',
    'mystery_a','mystery_b','trash_crossed_out'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'archive_puzzles'
        and column_name  = c
        and is_nullable  = 'NO'
    ) then
      execute format('alter table public.archive_puzzles alter column %I drop not null', c);
    end if;
  end loop;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Anyone can READ puzzles for any date (so the public app can fetch them).
-- Only authenticated users (you, after sign-in) can write.

alter table public.games               enable row level security;
alter table public.screenshot_puzzles enable row level security;
alter table public.trophy_puzzles      enable row level security;
alter table public.soundtrack_puzzles  enable row level security;
alter table public.blur_puzzles        enable row level security;
alter table public.archive_puzzles     enable row level security;
alter table public.crossword_puzzles   enable row level security;
alter table public.higherlower_puzzles enable row level security;
alter table public.higherlower_pairs   enable row level security;
alter table public.connections_puzzles enable row level security;

drop policy if exists "public read games" on public.games;
create policy "public read games" on public.games
  for select using (true);

drop policy if exists "admin write games" on public.games;
create policy "admin write games" on public.games
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read screenshots" on public.screenshot_puzzles;
create policy "public read screenshots" on public.screenshot_puzzles
  for select using (true);

drop policy if exists "admin write screenshots" on public.screenshot_puzzles;
create policy "admin write screenshots" on public.screenshot_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read trophy" on public.trophy_puzzles;
create policy "public read trophy" on public.trophy_puzzles
  for select using (true);

drop policy if exists "admin write trophy" on public.trophy_puzzles;
create policy "admin write trophy" on public.trophy_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read soundtrack" on public.soundtrack_puzzles;
create policy "public read soundtrack" on public.soundtrack_puzzles
  for select using (true);

drop policy if exists "admin write soundtrack" on public.soundtrack_puzzles;
create policy "admin write soundtrack" on public.soundtrack_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read blur" on public.blur_puzzles;
create policy "public read blur" on public.blur_puzzles
  for select using (true);

drop policy if exists "admin write blur" on public.blur_puzzles;
create policy "admin write blur" on public.blur_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read archive" on public.archive_puzzles;
create policy "public read archive" on public.archive_puzzles
  for select using (true);

drop policy if exists "admin write archive" on public.archive_puzzles;
create policy "admin write archive" on public.archive_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read crossword" on public.crossword_puzzles;
create policy "public read crossword" on public.crossword_puzzles
  for select using (true);

drop policy if exists "admin write crossword" on public.crossword_puzzles;
create policy "admin write crossword" on public.crossword_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read higherlower puzzles" on public.higherlower_puzzles;
create policy "public read higherlower puzzles" on public.higherlower_puzzles
  for select using (true);

drop policy if exists "admin write higherlower puzzles" on public.higherlower_puzzles;
create policy "admin write higherlower puzzles" on public.higherlower_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read higherlower pairs" on public.higherlower_pairs;
create policy "public read higherlower pairs" on public.higherlower_pairs
  for select using (true);

drop policy if exists "admin write higherlower pairs" on public.higherlower_pairs;
create policy "admin write higherlower pairs" on public.higherlower_pairs
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

drop policy if exists "public read connections" on public.connections_puzzles;
create policy "public read connections" on public.connections_puzzles
  for select using (true);

drop policy if exists "admin write connections" on public.connections_puzzles;
create policy "admin write connections" on public.connections_puzzles
  for all using (auth.role() = 'authenticated')
         with check (auth.role() = 'authenticated');

-- ── STORAGE BUCKETS ─────────────────────────────────────────────────────────
-- Public read, authenticated write.

insert into storage.buckets (id, name, public)
  values ('screenshots', 'screenshots', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('soundtracks', 'soundtracks', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('covers', 'covers', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('archive', 'archive', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('higherlower', 'higherlower', true)
  on conflict (id) do nothing;


drop policy if exists "public read screenshots bucket" on storage.objects;
create policy "public read screenshots bucket" on storage.objects
  for select using (bucket_id = 'screenshots');

drop policy if exists "admin write screenshots bucket" on storage.objects;
create policy "admin write screenshots bucket" on storage.objects
  for insert with check (bucket_id = 'screenshots' and auth.role() = 'authenticated');

drop policy if exists "admin update screenshots bucket" on storage.objects;
create policy "admin update screenshots bucket" on storage.objects
  for update using (bucket_id = 'screenshots' and auth.role() = 'authenticated');

drop policy if exists "admin delete screenshots bucket" on storage.objects;
create policy "admin delete screenshots bucket" on storage.objects
  for delete using (bucket_id = 'screenshots' and auth.role() = 'authenticated');

drop policy if exists "public read soundtracks bucket" on storage.objects;
create policy "public read soundtracks bucket" on storage.objects
  for select using (bucket_id = 'soundtracks');

drop policy if exists "admin write soundtracks bucket" on storage.objects;
create policy "admin write soundtracks bucket" on storage.objects
  for insert with check (bucket_id = 'soundtracks' and auth.role() = 'authenticated');

drop policy if exists "admin update soundtracks bucket" on storage.objects;
create policy "admin update soundtracks bucket" on storage.objects
  for update using (bucket_id = 'soundtracks' and auth.role() = 'authenticated');

drop policy if exists "admin delete soundtracks bucket" on storage.objects;
create policy "admin delete soundtracks bucket" on storage.objects
  for delete using (bucket_id = 'soundtracks' and auth.role() = 'authenticated');

drop policy if exists "public read covers bucket" on storage.objects;
create policy "public read covers bucket" on storage.objects
  for select using (bucket_id = 'covers');

drop policy if exists "admin write covers bucket" on storage.objects;
create policy "admin write covers bucket" on storage.objects
  for insert with check (bucket_id = 'covers' and auth.role() = 'authenticated');

drop policy if exists "admin update covers bucket" on storage.objects;
create policy "admin update covers bucket" on storage.objects
  for update using (bucket_id = 'covers' and auth.role() = 'authenticated');

drop policy if exists "admin delete covers bucket" on storage.objects;
create policy "admin delete covers bucket" on storage.objects
  for delete using (bucket_id = 'covers' and auth.role() = 'authenticated');

drop policy if exists "public read archive bucket" on storage.objects;
create policy "public read archive bucket" on storage.objects
  for select using (bucket_id = 'archive');

drop policy if exists "admin write archive bucket" on storage.objects;
create policy "admin write archive bucket" on storage.objects
  for insert with check (bucket_id = 'archive' and auth.role() = 'authenticated');

drop policy if exists "admin update archive bucket" on storage.objects;
create policy "admin update archive bucket" on storage.objects
  for update using (bucket_id = 'archive' and auth.role() = 'authenticated');

drop policy if exists "admin delete archive bucket" on storage.objects;
create policy "admin delete archive bucket" on storage.objects
  for delete using (bucket_id = 'archive' and auth.role() = 'authenticated');

drop policy if exists "public read higherlower bucket" on storage.objects;
create policy "public read higherlower bucket" on storage.objects
  for select using (bucket_id = 'higherlower');

drop policy if exists "admin write higherlower bucket" on storage.objects;
create policy "admin write higherlower bucket" on storage.objects
  for insert with check (bucket_id = 'higherlower' and auth.role() = 'authenticated');

drop policy if exists "admin update higherlower bucket" on storage.objects;
create policy "admin update higherlower bucket" on storage.objects
  for update using (bucket_id = 'higherlower' and auth.role() = 'authenticated');

drop policy if exists "admin delete higherlower bucket" on storage.objects;
create policy "admin delete higherlower bucket" on storage.objects
  for delete using (bucket_id = 'higherlower' and auth.role() = 'authenticated');

-- The old 'blur_images' bucket is no longer used (the blur game now blurs the
-- official cover from the 'covers' bucket). Drop its policies if they exist.
drop policy if exists "public read blur_images bucket" on storage.objects;
drop policy if exists "admin write blur_images bucket" on storage.objects;
drop policy if exists "admin update blur_images bucket" on storage.objects;
drop policy if exists "admin delete blur_images bucket" on storage.objects;
