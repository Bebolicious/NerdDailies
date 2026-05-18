import { NeoCard } from '../components/ui/NeoCard'
import { TagPill } from '../components/ui/TagPill'

export function HowToPlay() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wider mb-1">
        How to play
      </h1>
      <p className="text-sm text-ink-soft mb-6">
        Three small puzzles drop every day at local midnight. No sign-in — your
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
          <TagPill tone="mustard" className="mb-2">Soundtrack</TagPill>
          <p className="text-sm mt-2">
            Tiny snippet at first — 2s. Each miss unlocks more: 4s, 8s, 15s,
            30s, then the whole track.
          </p>
        </NeoCard>
      </div>
    </div>
  )
}
