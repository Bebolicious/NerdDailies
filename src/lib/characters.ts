// Playable "characters" for Higher/Lower hot-seat. Each player is dealt a
// distinct robot character (art lives in /public/characters, named by color).
// The character carries the player's identity color used across the hot-seat
// UI (turn banner, round-intro header, avatars, leaderboard).

export type CharacterId =
  | 'beige'
  | 'blue'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'turqoise'
  | 'white'
  | 'whitegold'

export type Character = {
  id: CharacterId
  label: string // human-facing color name
  img: string // public path to the portrait
  // CSS `background` value — a solid hex for everyone except whitegold, which
  // is a gradient. Use via inline style so it beats Tailwind bg-* classes.
  background: string
  // Whether text/icons sitting on top of `background` should be light or dark
  // for legible contrast.
  onColor: 'light' | 'dark'
}

export const CHARACTERS: Character[] = [
  { id: 'beige', label: 'Beige', img: '/characters/beige.png', background: '#8c7052', onColor: 'light' },
  { id: 'blue', label: 'Blue', img: '/characters/blue.png', background: '#29457c', onColor: 'light' },
  { id: 'green', label: 'Green', img: '/characters/green.png', background: '#3d4a28', onColor: 'light' },
  { id: 'orange', label: 'Orange', img: '/characters/orange.png', background: '#b25210', onColor: 'light' },
  { id: 'pink', label: 'Pink', img: '/characters/pink.png', background: '#c1697f', onColor: 'light' },
  { id: 'purple', label: 'Purple', img: '/characters/purple.png', background: '#42316a', onColor: 'light' },
  { id: 'red', label: 'Red', img: '/characters/red.png', background: '#6a1c19', onColor: 'light' },
  { id: 'turqoise', label: 'Turquoise', img: '/characters/turqoise.png', background: '#217a83', onColor: 'light' },
  { id: 'white', label: 'White', img: '/characters/white.png', background: '#dfdad5', onColor: 'dark' },
  {
    id: 'whitegold',
    label: 'White Gold',
    img: '/characters/whitegold.png',
    background: 'linear-gradient(135deg, #c3c3c2, #e5ba67)',
    onColor: 'dark',
  },
]

export const CHARACTER_IDS: CharacterId[] = CHARACTERS.map((c) => c.id)

const BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<
  CharacterId,
  Character
>

export function getCharacter(id: CharacterId): Character {
  return BY_ID[id] ?? CHARACTERS[0]
}

// Light text → paper-static, dark text → ink-static (the two static brand
// tokens, hardcoded here since this returns an inline style object).
export function characterStyle(id: CharacterId): {
  background: string
  color: string
} {
  const c = getCharacter(id)
  return {
    background: c.background,
    color: c.onColor === 'dark' ? '#1b1b3a' : '#fdf5e0',
  }
}
