# THE ARCHIVE — weekly escape room

> Rewritten. The original spec (one mystery game, a fixed room of 3 shelf boxes /
> 3 drawers / 2 frames / 1 chest) shipped, went live, and then got disabled:
> played as a group, one lucky clue handed over the answer and the whole week was
> over in about ten seconds. This is the reworked design that replaced it.
> Implementation notes live in `architecture.md` §2.6.

## Concept

One puzzle per week (Monday). Players are game historians investigating a dark,
atmospheric archive room full of interactive objects. Each object costs candles
to open and yields a different kind of clue.

## The three answers

The week is not one game — it's a case with **three** answers:

1. **Subject A** — a mystery game.
2. **Subject B** — a second mystery game.
3. **The link** — a freehand text answer: the one thing A and B have in common.

The two games are named through a single search box and fill whichever slot they
match, so they can be identified in either order. The link question only appears
once **both** games are named. This is the fix for the ten-second problem: a
perfect clue about subject A tells you nothing about B or the link, so no single
draw can end the round.

The link is authored from a category preset (release year, genre, developer,
publisher, platform, franchise, composer, engine, director, setting, shared
mechanic, award, or custom), each of which supplies a default player-facing
prompt. Matching is deliberately forgiving — case, accents, punctuation, `&` vs
"and", and a leading "the/a/an" are all ignored — and the admin can add any
number of accepted alternates on top ("the year 2000", "y2k").

## Resources

- A per-week **candle budget** (default 7). Opening a clue costs its own candle
  price, set per clue by the admin.
- **4 wrong guesses** shared across all three answers. A wrong game guess and a
  wrong link guess cost the same.
- Each wrong guess **locks** one random still-sealed clue for good (never the
  chest, never a jackpot) and **sharpens** every image clue authored to sharpen.
- A one-time spare candle stub is wedged behind the filing cabinet. It only
  surfaces once the player is genuinely low, so it reads as a rescue.

## The room

The room is **authored**, not fixed. Every clue is one entry in a list carrying
its own container, emoji, name, subject, candle cost, placement, and body
(text / image / audio). One shelf box or nine; a radio with four cassettes; a
chest holding a wax-sealed letter instead of a logo crop — all valid weeks.

| Container | What it is |
|---|---|
| 🖼️ **Wall** | Framed things. Smeared portrait, framed poster, security still, blueprint, newspaper clipping, wall intercom. Image presets can sharpen with each wrong guess. |
| 🔒 **Sealed chest** | The expensive one, one per week. Cropped title logo, sealed photograph, wax-sealed letter, locked recording, dossier page. The logo crop is no longer mandatory. |
| 📦 **Bookshelf** | Boxes. Dated ledger, shipping manifest, genre index card, torn page, evidence bag, polaroid, wax cylinder, or a plain box you write yourself. |
| 🗄️ **Filing cabinet** | Drawers, drawn as actual drawer fronts — recessed inner panel, pull handle dead centre, candle cost beneath it. **Unlabelled**: a shut drawer shows no name, emoji or tooltip, so you just pick one and take what's in it. Memo, press pitch, review clipping, personnel file, redacted report, contact sheet, dictaphone tape. |
| 📻 **Radio** | Cassette with a track, channel with NPC dialogue, sound-effect reel, voice memo, ad jingle, emergency broadcast. |
| 📦 **Mystery boxes** | Unmarked parcels, always hidden. Jackpot / straight clue / red herring / lore. A jackpot stays sealed until the player's last guess, then opens **free**. |

## Subjects are hidden until purchase

Every clue is tagged with what it points at — Subject A, Subject B, Both, The
link, or Misfiled (a red herring). A **sealed** tile shows only its emoji, name
and cost. The subject chip appears the moment you pay to open it, and the desk
then files the clue under the right heading. You cannot cherry-pick clues for
the answer you're stuck on.

## Hidden clues

Any clue can be stashed instead of shelved: behind the bookshelf, in the trash
can, under the rug, behind the painting, or in the wall vent. Its container
shows a `? ? ?` gap until the player searches that spot. **Searching is free**;
opening what you found still costs candles. Only spots actually in use render a
prop, so an empty corner is never a false lead. The trash keeps its rummaging
animation and can also turn up a crumpled, crossed-out wrong title.

## Layout

Room on the left, desk (the case file) on the right. The desk holds the three
answer slots, the guess inputs, and the dossier of everything opened so far,
grouped by subject.

The room gets the space — it's the game, the desk is just the notepad. The desk
is a fixed ~400–440px column and the room absorbs everything else, with no
max-width cap so nothing is left dead to the right on a wide screen. Below
~1100px of available width the desk drops to a full-width row underneath the
room, which is the phone layout. It's all container-query driven, so it reacts
to the width the page actually got rather than the window size — the 340px
games sidebar takes a real bite out of it.

## Scoring & share

Rank is mostly candles left, with the wrong-guess stamps as a secondary penalty
so a frugal-but-sloppy run doesn't outrank a clean one: Archivist → Detective →
Investigator → Intern → Ghost. The share string shows a tick per answer, the
candle burn, the wrong stamps, and how many clues were opened.

## Visual style

Dark academia / noir archive. Deep browns, aged paper, candlelight warm tones —
all driven by the app's own theme tokens so the room flips with light/dark mode.
CSS candle flicker, drifting dust particles, faint hover glow on anything
interactive, a serif/typewriter face for clue text, and a "WRONG CASE FILE"
stamp slam on every miss. All animation is disabled under
`prefers-reduced-motion`.
