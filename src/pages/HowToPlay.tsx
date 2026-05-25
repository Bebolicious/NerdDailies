import { NeoCard } from '../components/ui/NeoCard'
import { TagPill } from '../components/ui/TagPill'

export function HowToPlay() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wider mb-1">
        How to play
      </h1>
      <p className="text-sm text-ink-soft mb-6">
        Four small puzzles drop every day at local midnight. No sign-in — your
        history lives on this device.
      </p>
      <div className="flex flex-col gap-4">
        <NeoCard tone="paper" shadow="md" className="p-5">
          <TagPill tone="coral" className="mb-2">Screenshot</TagPill>
          <p className="text-sm mt-2">
            Six images, one per guess attempt. Each wrong guess reveals a new,
            clearer still. Get it on guess 6 if the chunky pixels aren't enough.
          </p>
        </NeoCard>
        <NeoCard tone="paper" shadow="md" className="p-5">
          <TagPill tone="blue" className="mb-2">Trophy</TagPill>
          <p className="text-sm mt-2">
            You see only the achievement's name to start. Wrong #1 reveals the
            description, wrong #2–5 unlock additional clues.
          </p>
        </NeoCard>
        <NeoCard tone="paper" shadow="md" className="p-5">
          <TagPill tone="lime" className="mb-2">Blur Reveal</TagPill>
          <p className="text-sm mt-2">
            The game's official cover starts almost completely blurred. Each
            wrong guess sharpens it one notch — by guess 6 it's fully clear.
          </p>
        </NeoCard>
        <NeoCard tone="paper" shadow="md" className="p-5">
          <TagPill tone="mustard" className="mb-2">Soundtrack</TagPill>
          <p className="text-sm mt-2">
            Tiny snippet at first — 1s. Each miss unlocks more: 4s, 8s, 15s,
            30s, then the whole track.
          </p>
        </NeoCard>
        <NeoCard tone="paper" shadow="md" className="p-5">
          <TagPill tone="violet" className="mb-2">The Archive · weekly</TagPill>
          <p className="text-sm mt-2">
            Drops once a week, on Monday. You start with 5 candles (🕯️) and 3
            wrong guesses. Spend candles to open shelves, drawers, the radio,
            wall frames, mystery boxes, and a sealed chest — each yields a
            different kind of clue. Rummaging the trash is free. Each wrong
            guess locks a clue and sharpens the wall frames. Solve it with as
            many candles unspent as possible to earn a higher rank.
          </p>
        </NeoCard>
      </div>
    </div>
  )
}
