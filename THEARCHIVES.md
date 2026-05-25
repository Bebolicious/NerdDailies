Build a Weekly browser minigame called "THE ARCHIVE."
Concept: This game is a on a week basis so only one per week, this should be hooked up to the admin panel so that we can make this new weekly game aswell as our dailies, and also make sure the sql files is updated so i can run it in supabase. Players are game historians identifying a mystery videogame by investigating a dark, atmospheric archive room filled with interactive objects. Each object reveals a different type of clue. The goal is to guess the game's title in as few clues and wrong guesses as possible.
Resource system: Player starts with 5 candles (🕯️). Opening most clue objects costs 1 candle. The sealed chest costs 2. Wrong guesses lock one box but don't cost candles. Candles remaining determine end-of-game rank.
Room objects and their clue types:

📦 Shelf (3 Standard Boxes) — 1 candle each. Box A: release year. Box B: genre tag. Box C: original platform.
🗄️ Filing Cabinet (3 drawers) — 1 candle each. Top: magazine-style one-line pitch. Middle: fake internal developer memo. Bottom: fake review score + snippet.
📻 Radio — 1 candle. Plays an embedded audio clip (OST or sound effect). Visualize as a pulsing waveform while playing.
🖼️ Wall Frames (2 frames) — 1 candle each. Show heavily blurred/pixelated images (gameplay screenshot + key art). Each wrong guess auto-sharpens them one step (5 blur levels total).
🗃️ Desk — Always free/visible. Shows the guess input with autocomplete, a black silhouette of the game's logo, and remaining guess count.
📦 Mystery Boxes (2, hidden) — 1 candle each. Hidden behind a bookshelf and inside the trash can. Each randomly yields one of four outcomes: jackpot (full art for 3s), useful clue, red herring from a different game, or a weird lore trivia fact.
🔒 Sealed Chest — 2 candles. Reveals a cropped partial view of the game's actual title logo.
🗑️ Trash Can — Free, but triggers a 2–3 second rummaging animation before revealing: a crossed-out wrong answer, a mystery box, or nothing (30% chance).

Guess mechanics: Autocomplete input from a provided game list array. Max 3 wrong guesses. Each wrong guess: stamps "WRONG CASE FILE" animation on the desk, permanently locks one random unlocked standard box, and sharpens the wall images one step. After 3 wrong guesses the room goes dark and the answer is revealed with a clue breakdown.
Scoring & share output: At end of game show candles remaining, boxes opened, wrong guesses, and a rank title (Archivist / Detective / Investigator / Intern / Ghost). Generate a shareable emoji string showing candle usage, clues opened, and wrong guesses.
Example of a daily config JSON shape:
json{
"day": 47,
"answer": "Deus Ex",
"answerList": ["Deus Ex", "Half-Life", ...],
"logoSilhouette": "deus-ex-silhouette.svg",
"clues": {
"year": "2000",
"genre": "Immersive Sim",
"platform": "PC, PS2",
"pitch": "A cyberpunk espionage RPG where every mission can be solved your way.",
"memo": "Reminder: JC Denton's trenchcoat physics are NOT a priority for ship date.",
"review": "9.4/10 — 'A landmark in player freedom.' — PC Gamer, 2000",
"audioClip": "/audio/deus-ex-theme.mp3",
"frameImage1": "/img/deus-ex-gameplay.jpg",
"frameImage2": "/img/deus-ex-keyart.jpg",
"chestLogoPartial": "/img/deus-ex-logo-partial.png",
"mysteryBoxA": { "type": "lore", "text": "The original design doc called this game 'Majestic Revelations.'" },
"mysteryBoxB": { "type": "redHerring", "game": "System Shock 2", "text": "Misfiled by Gerald again — this note is about a different game entirely." },
"trashCrossedOut": "Quake III Arena"
},
"weeklyTheme": "Games from the year 2000"
}
Visual style: Dark academia / noir archive aesthetic. Deep browns, aged paper textures, candlelight warm tones. CSS animated candle flicker on the candle counter. Subtle dust particle animation in the background. Objects should glow faintly on hover to indicate interactability. Use a serif or typewriter font for clue text reveals. Modal/drawer animations when opening boxes — paper unfolding, drawer sliding, etc.
