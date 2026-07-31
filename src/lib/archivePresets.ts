import type {
  ArchiveClue,
  ArchiveClueSubject,
  ArchiveContainer,
  ArchiveHidingSpot,
  ArchiveLink,
} from './types'
import { ARCHIVE_DEFAULT_COSTS } from './types'

// The authoring catalog for The Archive's room. This file is the ONLY place
// that knows what a clue can be — the player page and the admin editor both
// render off it, so adding a new kind of clue is a one-entry change here.
//
// A preset is a starting point, never a constraint: it seeds the emoji, the
// in-room name and the body kind, and the admin can overwrite the emoji and
// name freely afterwards. That's the whole point of the rework — the room is
// authored, not filled into fixed "Box A / Box B / Box C" slots.

export type ArchiveBodyKind = 'text' | 'image' | 'audio'

export type ArchivePreset = {
  id: string
  label: string // admin dropdown label
  emoji: string
  name: string // default in-room name
  body: ArchiveBodyKind
  placeholder?: string
  hint?: string
  // Image bodies only: start blurred and sharpen one step per wrong guess.
  sharpens?: boolean
}

// ── Per-container presets ───────────────────────────────────────────────────
// Names are deliberately in-fiction. The old "FRAME · GAMEPLAY" labels read
// like a CMS field and broke the escape-room immersion.

const WALL: ArchivePreset[] = [
  { id: 'smeared-portrait', label: 'Smeared portrait', emoji: '🖼️', name: 'Smeared portrait', body: 'image', sharpens: true, hint: 'A gameplay still, badly kept. Sharpens with each wrong guess.' },
  { id: 'framed-poster', label: 'Framed poster', emoji: '🖼️', name: 'Framed poster', body: 'image', sharpens: true, hint: 'Key art behind dusty glass.' },
  { id: 'pinned-photo', label: 'Pinned photograph', emoji: '📌', name: 'Pinned photograph', body: 'image', hint: 'Stays sharp — good for a tightly cropped detail.' },
  { id: 'security-still', label: 'Security still', emoji: '📷', name: 'Security still', body: 'image', sharpens: true },
  { id: 'blueprint', label: 'Blueprint fragment', emoji: '📐', name: 'Blueprint fragment', body: 'image', hint: 'A map, a level layout, a schematic.' },
  { id: 'clipping', label: 'Newspaper clipping', emoji: '📰', name: 'Newspaper clipping', body: 'text', placeholder: 'LOCAL STUDIO SHIPS IMPOSSIBLE GAME — “nobody thought it would run”' },
  { id: 'wall-scrawl', label: 'Scrawl on the wall', emoji: '✍️', name: 'Scrawl on the wall', body: 'text', placeholder: 'THE CAKE PART WAS TRUE' },
  { id: 'intercom', label: 'Wall intercom', emoji: '🔊', name: 'Wall intercom', body: 'audio', placeholder: 'Crackling announcement' },
]

const CHEST: ArchivePreset[] = [
  { id: 'cropped-logo', label: 'Cropped title logo', emoji: '🔒', name: 'Sealed chest', body: 'image', hint: 'A tight crop of the real title logo. The classic — but no longer required.' },
  { id: 'sealed-photo', label: 'Sealed photograph', emoji: '🔒', name: 'Sealed chest', body: 'image' },
  { id: 'wax-letter', label: 'Wax-sealed letter', emoji: '🔒', name: 'Sealed chest', body: 'text', placeholder: 'To whoever finds this: they cut the third act. Look for the seams.' },
  { id: 'locked-recording', label: 'Locked recording', emoji: '🔒', name: 'Sealed chest', body: 'audio' },
  { id: 'dossier', label: 'Dossier page', emoji: '🔒', name: 'Sealed chest', body: 'text' },
]

const SHELF: ArchivePreset[] = [
  { id: 'ledger', label: 'Dated ledger', emoji: '📒', name: 'Dated ledger', body: 'text', placeholder: '2000', hint: 'Traditionally the release year.' },
  { id: 'manifest', label: 'Shipping manifest', emoji: '📋', name: 'Shipping manifest', body: 'text', placeholder: 'PC · PS2', hint: 'Traditionally the platforms.' },
  { id: 'index-card', label: 'Genre index card', emoji: '🗂️', name: 'Genre index card', body: 'text', placeholder: 'Immersive sim' },
  { id: 'torn-page', label: 'Torn page', emoji: '📄', name: 'Torn page', body: 'text' },
  { id: 'evidence-bag', label: 'Evidence bag', emoji: '🧪', name: 'Evidence bag', body: 'text', placeholder: 'One (1) keycard, bent. One (1) pair of sunglasses, worn indoors.' },
  { id: 'loose-trivia', label: 'Loose trivia', emoji: '🎲', name: 'Loose trivia', body: 'text' },
  { id: 'polaroid', label: 'Polaroid', emoji: '📸', name: 'Polaroid', body: 'image' },
  { id: 'wax-cylinder', label: 'Wax cylinder', emoji: '🎚️', name: 'Wax cylinder', body: 'audio' },
  { id: 'plain-box', label: 'Plain box', emoji: '📦', name: 'Plain box', body: 'text', hint: 'No flavor — just a box. Write whatever you want.' },
]

const CABINET: ArchivePreset[] = [
  { id: 'memo', label: 'Internal memo', emoji: '📝', name: 'Internal memo', body: 'text', placeholder: "Reminder: the protagonist's trenchcoat physics are NOT a priority for ship date." },
  { id: 'pitch', label: 'Press pitch', emoji: '🗞️', name: 'Press pitch', body: 'text', placeholder: 'A cyberpunk espionage RPG where every mission can be solved your way.' },
  { id: 'review', label: 'Review clipping', emoji: '⭐', name: 'Review clipping', body: 'text', placeholder: "9.4/10 — 'A landmark in player freedom.'" },
  { id: 'personnel', label: 'Personnel file', emoji: '👤', name: 'Personnel file', body: 'text' },
  { id: 'redacted', label: 'Redacted report', emoji: '⬛', name: 'Redacted report', body: 'text', placeholder: 'The ██████ sequence was cut for ████████ reasons.' },
  { id: 'postcard', label: 'Postcard', emoji: '💌', name: 'Postcard', body: 'text' },
  { id: 'contact-sheet', label: 'Contact sheet', emoji: '🎞️', name: 'Contact sheet', body: 'image' },
  { id: 'dictaphone', label: 'Dictaphone tape', emoji: '🎙️', name: 'Dictaphone tape', body: 'audio' },
]

const RADIO: ArchivePreset[] = [
  { id: 'cassette', label: 'Cassette · track', emoji: '📼', name: 'Cassette', body: 'audio', hint: 'A soundtrack cut. Add the track name as the caption if you want it visible.' },
  { id: 'channel', label: 'Channel · NPC dialogue', emoji: '📻', name: 'Channel', body: 'text', placeholder: '“Hey. You. You’re finally awake.”' },
  { id: 'sfx', label: 'Sound-effect reel', emoji: '🔉', name: 'Sound-effect reel', body: 'audio', hint: 'A recognizable pickup jingle, gun, menu blip…' },
  { id: 'voice-memo', label: 'Static · voice memo', emoji: '🎙️', name: 'Voice memo', body: 'audio' },
  { id: 'jingle', label: 'Ad jingle', emoji: '🎵', name: 'Ad jingle', body: 'audio' },
  { id: 'broadcast', label: 'Emergency broadcast', emoji: '📡', name: 'Emergency broadcast', body: 'text' },
]

const MYSTERY: ArchivePreset[] = [
  { id: 'jackpot', label: 'Jackpot', emoji: '📦', name: 'Mystery box', body: 'image', hint: 'Full art, revealed for 3 seconds. Stays sealed until the last guess, then opens free.' },
  { id: 'clue', label: 'Straight clue', emoji: '📦', name: 'Mystery box', body: 'text' },
  { id: 'redHerring', label: 'Red herring', emoji: '📦', name: 'Mystery box', body: 'text', placeholder: 'Misfiled by Gerald again — this note is about a different game entirely.' },
  { id: 'lore', label: 'Lore fragment', emoji: '📦', name: 'Mystery box', body: 'text', placeholder: "The original design doc called this game 'Majestic Revelations.'" },
]

export const ARCHIVE_PRESETS: Record<ArchiveContainer, ArchivePreset[]> = {
  wall: WALL,
  chest: CHEST,
  shelf: SHELF,
  cabinet: CABINET,
  radio: RADIO,
  mystery: MYSTERY,
}

export function findPreset(
  container: ArchiveContainer,
  id: string,
): ArchivePreset {
  const list = ARCHIVE_PRESETS[container]
  return list.find((p) => p.id === id) ?? list[0]
}

// ── Container chrome ────────────────────────────────────────────────────────

export const ARCHIVE_CONTAINER_META: Record<
  ArchiveContainer,
  { label: string; blurb: string; max: number }
> = {
  wall: { label: 'Wall', blurb: 'Framed things hung around the room.', max: 6 },
  chest: { label: 'Sealed chest', blurb: 'The expensive one. At most one per week.', max: 1 },
  shelf: { label: 'Bookshelf', blurb: 'Boxes on the shelf — as few or as many as you like.', max: 12 },
  cabinet: { label: 'Filing cabinet', blurb: 'Drawers. Pull one open.', max: 8 },
  radio: { label: 'Radio', blurb: 'Cassettes, channels, sound-effect reels.', max: 8 },
  mystery: { label: 'Mystery boxes', blurb: 'Unmarked parcels. Always hidden somewhere.', max: 4 },
}

// ── Clue subjects ───────────────────────────────────────────────────────────

export const ARCHIVE_SUBJECTS: {
  id: ArchiveClueSubject
  label: string
  chip: string
  hint: string
}[] = [
  { id: 'a', label: 'Subject A (first game)', chip: 'Subject A', hint: 'Points at the first mystery game.' },
  { id: 'b', label: 'Subject B (second game)', chip: 'Subject B', hint: 'Points at the second mystery game.' },
  { id: 'both', label: 'Both games', chip: 'Both', hint: 'True of both games — useful but ambiguous.' },
  { id: 'link', label: 'The link', chip: 'The link', hint: 'Points at what the two games have in common.' },
  { id: 'herring', label: 'Misfiled (red herring)', chip: 'Misfiled', hint: 'Deliberately misleading. Costs a candle and gives nothing.' },
]

export function subjectChip(subject: ArchiveClueSubject): string {
  return ARCHIVE_SUBJECTS.find((s) => s.id === subject)?.chip ?? 'Filed'
}

// ── Hiding spots ────────────────────────────────────────────────────────────
// A clue with a hidingSpot doesn't appear in its container until the player
// pokes around the room and finds it. Discovery is always free — paying to
// open it is a separate step.

export const ARCHIVE_HIDING_SPOTS: {
  id: ArchiveHidingSpot
  label: string
  found: string
}[] = [
  { id: 'shelf', label: 'Behind the bookshelf', found: 'Something was wedged behind the bookshelf.' },
  { id: 'trash', label: 'In the trash can', found: 'You fish a small parcel out of the trash.' },
  { id: 'rug', label: 'Under the rug', found: 'The rug was hiding a loose floorboard.' },
  { id: 'painting', label: 'Behind the painting', found: 'The painting swings aside. Of course it does.' },
  { id: 'vent', label: 'In the wall vent', found: 'The vent grille comes away in your hand.' },
]

export function hidingSpotLabel(id: ArchiveHidingSpot): string {
  return ARCHIVE_HIDING_SPOTS.find((s) => s.id === id)?.label ?? 'Hidden'
}

// ── The link (third answer) ─────────────────────────────────────────────────

export type ArchiveLinkPreset = {
  id: string
  label: string
  prompt: string
  placeholder: string
}

export const ARCHIVE_LINK_PRESETS: ArchiveLinkPreset[] = [
  { id: 'year', label: 'Release year', prompt: 'Both games came out the same year. Which year?', placeholder: '2000' },
  { id: 'genre', label: 'Genre', prompt: 'Both games share a genre. Name it.', placeholder: 'Immersive sim' },
  { id: 'developer', label: 'Developer / studio', prompt: 'The same studio made both. Who?', placeholder: 'Ion Storm' },
  { id: 'publisher', label: 'Publisher', prompt: 'Both were published by the same company. Who?', placeholder: 'Eidos Interactive' },
  { id: 'platform', label: 'Console / platform', prompt: 'Both launched on the same platform. Which one?', placeholder: 'PlayStation 2' },
  { id: 'franchise', label: 'Franchise / universe', prompt: 'Both belong to the same world. Which one?', placeholder: 'Half-Life' },
  { id: 'composer', label: 'Composer', prompt: 'The same person scored both. Who?', placeholder: 'Jeremy Soule' },
  { id: 'engine', label: 'Game engine', prompt: 'Both run on the same engine. Which?', placeholder: 'Unreal Engine' },
  { id: 'director', label: 'Director / creator', prompt: 'The same person led both. Who?', placeholder: 'Warren Spector' },
  { id: 'setting', label: 'Setting / era', prompt: 'Both are set in the same place or era. Where?', placeholder: 'Near-future dystopia' },
  { id: 'mechanic', label: 'Shared mechanic', prompt: 'Both are built around the same mechanic. Which?', placeholder: 'Time rewind' },
  { id: 'award', label: 'Award', prompt: 'Both won the same award. Which one?', placeholder: 'Game of the Year' },
  { id: 'custom', label: 'Custom…', prompt: '', placeholder: '' },
]

export function findLinkPreset(id: string): ArchiveLinkPreset {
  return (
    ARCHIVE_LINK_PRESETS.find((p) => p.id === id) ??
    ARCHIVE_LINK_PRESETS[ARCHIVE_LINK_PRESETS.length - 1]
  )
}

// Fold a freehand answer down to something comparable: case, accents,
// punctuation and leading articles all stop mattering, so "The Year 2000!" and
// "year 2000" both land on the same string. Deliberately forgiving — the third
// answer is a deduction, not a spelling test.
export function normalizeLinkAnswer(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// True when the player's text matches the canonical answer or any alternate.
export function matchesLink(input: string, link: ArchiveLink): boolean {
  const guess = normalizeLinkAnswer(input)
  if (!guess) return false
  return [link.answer, ...link.accept].some(
    (candidate) => normalizeLinkAnswer(candidate) === guess,
  )
}

// ── Factories ───────────────────────────────────────────────────────────────

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `clue-${Math.random().toString(36).slice(2, 10)}`
}

// A blank body of the shape the preset calls for. Takes the whole preset, not
// just the kind, so an image preset that advertises "sharpens with each wrong
// guess" actually starts with that turned on — otherwise the admin sees a hint
// promising a behaviour the unchecked box doesn't deliver.
export function emptyBody(preset: ArchivePreset): ArchiveClue['body'] {
  if (preset.body === 'text') return { kind: 'text', text: '' }
  if (preset.body === 'image')
    return { kind: 'image', src: '', sharpens: !!preset.sharpens }
  return { kind: 'audio', src: '' }
}

// A fresh clue for the editor's "+ add" buttons, pre-seeded from a preset.
export function blankClue(
  container: ArchiveContainer,
  presetId?: string,
): ArchiveClue {
  const preset = findPreset(container, presetId ?? ARCHIVE_PRESETS[container][0].id)
  return {
    id: newId(),
    container,
    preset: preset.id,
    emoji: preset.emoji,
    name: preset.name,
    subject: 'a',
    cost: ARCHIVE_DEFAULT_COSTS[container],
    body: emptyBody(preset),
    ...(container === 'mystery'
      ? { outcome: preset.id as ArchiveClue['outcome'], hiddenSpot: 'shelf' as ArchiveHidingSpot }
      : {}),
  }
}

// Switch a clue to a different preset. The body kind follows the new preset,
// and emoji/name follow it too — but only if they were still the OUTGOING
// preset's defaults, so a hand-written label is never clobbered.
export function applyPreset(clue: ArchiveClue, presetId: string): ArchiveClue {
  const old = findPreset(clue.container, clue.preset)
  const next = findPreset(clue.container, presetId)
  return {
    ...clue,
    preset: next.id,
    emoji: clue.emoji === old.emoji ? next.emoji : clue.emoji,
    name: clue.name === old.name ? next.name : clue.name,
    body: old.body === next.body ? clue.body : emptyBody(next),
    ...(clue.container === 'mystery'
      ? { outcome: next.id as ArchiveClue['outcome'] }
      : {}),
  }
}

// True once a clue is authored well enough to show a player.
export function clueIsComplete(clue: ArchiveClue): boolean {
  if (!clue.name.trim()) return false
  if (clue.body.kind === 'text') return clue.body.text.trim().length > 0
  return clue.body.src.trim().length > 0
}
