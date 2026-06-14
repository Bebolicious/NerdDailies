import type { GameType } from '../../lib/types'
import { GuestBanner } from './GuestBanner'

type Props = {
  value: string
  onChange: (v: string) => void
  gameType: GameType
}

export function SubmitterField({ value, onChange, gameType }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        Guest submitter (optional)
      </span>
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. bee_lover42"
          className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper flex-1 min-w-[200px]"
        />
        {value.trim() && (
          <div className="relative">
            <GuestBanner
              name={value.trim()}
              gameType={gameType}
              variant="inline"
            />
          </div>
        )}
      </div>
      <span className="text-[10px] text-ink-soft">
        When set, a diagonal “GUEST · NAME” banner appears on the player puzzle.
      </span>
    </label>
  )
}
