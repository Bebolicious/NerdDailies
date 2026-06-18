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
create table if not exists public.archive_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_week date not null unique,
  game_id bigint not null,
  game_name text not null,
  game_year int,
  game_genre text,

  -- Standard text clues (shelf + filing cabinet)
  clue_year text not null,
  clue_genre text not null,
  clue_platform text not null,
  clue_pitch text not null,
  clue_memo text not null,
  clue_review text not null,

  weekly_theme text,

  -- Asset paths in the 'archive' bucket
  audio_path text,                           -- optional radio clip
  frame1_path text not null,                 -- gameplay screenshot
  frame2_path text not null,                 -- key art
  chest_logo_path text not null,             -- cropped partial logo

  -- JSONB lets the editor swap shapes (jackpot/clue/redHerring/lore) freely
  mystery_a jsonb not null,
  mystery_b jsonb not null,
  trash_crossed_out text not null,

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

  -- Stat the player is comparing. Free text so new categories can be added
  -- in the app without a migration; the player UI falls back gracefully.
  category text not null,

  game_a_id bigint not null,
  game_a_name text not null,
  game_a_year int,
  game_a_value numeric not null,
  game_a_display text,
  game_a_cover_path text,

  game_b_id bigint not null,
  game_b_name text not null,
  game_b_year int,
  game_b_value numeric not null,
  game_b_display text,
  game_b_cover_path text,

  created_at timestamptz default now(),
  unique (puzzle_id, position)
);

create index if not exists higherlower_pairs_puzzle_idx
  on public.higherlower_pairs (puzzle_id, position);

-- The daily mini-crossword. No IGDB game reference — the puzzle is the answer.
-- `solution` is a flat row-major array; null entries are blocks. Clues are
-- stored as JSON arrays of {number, text}; numbering is derived client-side
-- from the solution so the DB stays small.
create table if not exists public.crossword_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  size int not null check (size between 4 and 8),
  solution text[] not null,                  -- length = size*size; null = block
  clues_across jsonb not null default '[]'::jsonb,
  clues_down jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
