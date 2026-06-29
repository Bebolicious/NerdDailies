// Distinct platform abbreviations present in `public.games.platforms` (the
// values IGDB returns as `platforms.abbreviation`, written to the seed by
// scripts/import-igdb-games.mjs). Ordered most-common-first so the consoles
// most puzzles use sit at the top of the picker. Re-derive after a big catalog
// re-import:
//   grep -o "'{[^}]*}'" supabase/seed-games.sql | tr ',' '\n' \
//     | tr -d "'{}\"" | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn
export const DB_PLATFORMS = [
  'PC', 'PS4', 'Mac', 'XONE', 'Switch', 'PS2', 'PS3', 'PS5', 'iOS', 'X360',
  'Series X|S', 'Wii', 'Linux', 'XBOX', 'PS1', 'Android', 'NDS', 'WiiU', '3DS',
  'NGC', 'Arcade', 'PSP', 'Vita', 'SNES', 'GBA', 'Genesis/MegaDrive', 'N64',
  'DOS', 'NES', 'Game Boy', 'DC', 'SFAM', 'Amiga', 'famicom', 'Switch 2',
  'Saturn', 'Stadia', 'C64', 'Atari-ST', 'Mobile', 'ZXS', 'ACPC', 'browser',
  'neogeoaes', 'Win Phone', 'MSX', 'SMS', 'New 3DS', 'Game Gear', 'turbografx16',
  'Apple][', 'GBC', 'Sega CD', '3DO', 'blackberry', 'x1', 'fds', 'Ouya',
  'neogeomvs', 'Amiga CD32', 'PSVR', 'Steam VR', 'Atari8bit', 'Acorn Archimedes',
  'bbcmicro', 'Jaguar', 'Philips CDI', 'OnLive', 'Sega32', 'MSX2', 'FireTV',
  'Atari2600', 'Meta Quest 2', 'NGage', 'Lynx', 'sg1000', 'colecovision',
  'PSVR2', 'Atari7800', 'Atari5200', 'Acorn Electron', 'intellivision', '64DD',
  'vic-20', 'C16', 'zod', 'ti-99', 'WonderSwan', 'Meta Quest 3', 'C+4',
  'vectrex', 'Oculus VR', 'Handheld', 'Gear VR',
] as const
