import type { GameType, PuzzleDecor, ScreenEffectType } from '../../lib/types'
import { SCREEN_EFFECTS } from '../../lib/decor'
import { GuestBanner } from './GuestBanner'

// Admin editor block for a puzzle's decoration: the submitter credit, an
// optional custom banner (text + color, overrides the credit), and an optional
// page-wide screen effect shown on finish. Reused by all game editors.

type Props = {
  value: PuzzleDecor
  onChange: (next: PuzzleDecor) => void
  gameType: GameType
}

const labelCls = 'font-display text-[10px] uppercase tracking-wider font-bold'
const inputCls =
  'border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper w-full'

export function PuzzleDecorFields({ value, onChange, gameType }: Props) {
  const set = (patch: Partial<PuzzleDecor>) => onChange({ ...value, ...patch })

  const effectType = value.effectType ?? ''
  const showEffectDetails = effectType !== ''
  const showEmoji = effectType === 'falling' || effectType === 'rising' || effectType === 'confetti'

  return (
    <div className="flex flex-col gap-4 border-neo-2 border-dashed bg-cream-soft/40 p-4">
      <div className="font-display text-xs uppercase tracking-wider font-bold text-ink">
        Banner &amp; screen effect
      </div>

      {/* Submitter credit */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Guest submitter (optional)</span>
        <input
          value={value.submitter ?? ''}
          onChange={(e) => set({ submitter: e.target.value })}
          placeholder="e.g. bee_lover42"
          className={inputCls}
        />
        <span className="text-[10px] text-ink-soft">
          Shows a “Submitted by NAME” corner banner on the finished puzzle.
        </span>
      </label>

      {/* Custom banner — overrides the submitter credit */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Custom banner (optional — overrides submitter)</span>
        <div className="flex items-start gap-3 flex-wrap">
          <input
            value={value.bannerText ?? ''}
            onChange={(e) => set({ bannerText: e.target.value })}
            placeholder="e.g. Valentine's Day"
            className={`${inputCls} flex-1 min-w-[200px]`}
          />
          <ColorField
            label="Banner color"
            value={value.bannerColor}
            fallback="#ff8ac0"
            onChange={(v) => set({ bannerColor: v })}
          />
        </div>
        {(value.bannerText?.trim() || value.submitter?.trim()) && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] text-ink-soft">Preview:</span>
            <div className="relative">
              <GuestBanner
                gameType={gameType}
                submitter={value.submitter}
                text={value.bannerText}
                color={value.bannerColor}
                variant="inline"
              />
            </div>
          </div>
        )}
      </div>

      {/* Screen effect */}
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Screen effect on finish (optional)</span>
          <select
            value={effectType}
            onChange={(e) =>
              set({ effectType: (e.target.value || undefined) as ScreenEffectType | undefined })
            }
            className={inputCls}
          >
            {SCREEN_EFFECTS.map((eff) => (
              <option key={eff.id || 'none'} value={eff.id}>
                {eff.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-ink-soft">
            {SCREEN_EFFECTS.find((e) => e.id === effectType)?.hint}
          </span>
        </label>

        {showEffectDetails && (
          <div className="flex items-end gap-3 flex-wrap">
            {showEmoji && (
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Emoji</span>
                <input
                  value={value.effectEmoji ?? ''}
                  onChange={(e) => set({ effectEmoji: e.target.value })}
                  placeholder="❤️"
                  className={`${inputCls} w-24 text-center text-lg`}
                />
              </label>
            )}
            <ColorField
              label="Effect / vignette color"
              value={value.effectColor}
              fallback="#ff5d8f"
              onChange={(v) => set({ effectColor: v })}
            />
            {value.effectColor?.trim() && (
              <div
                className="border-neo-2 h-10 w-16 shrink-0"
                title="Vignette color"
                style={{
                  background: `radial-gradient(ellipse at center, transparent 30%, ${value.effectColor} 100%)`,
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value?: string
  fallback: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value?.trim() || fallback}
          onChange={(e) => onChange(e.target.value)}
          className="border-neo-2 h-9 w-10 cursor-pointer bg-cream-soft p-0.5"
          aria-label={label}
        />
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          className="border-neo bg-cream-soft px-2 py-2 text-xs font-bold outline-none focus:bg-paper w-24"
        />
        {value?.trim() && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="border-neo-2 px-2 py-1 text-[10px] font-display font-bold uppercase hover:bg-coral hover:text-ink-static"
            aria-label={`Clear ${label}`}
          >
            Clear
          </button>
        )}
      </div>
    </label>
  )
}
