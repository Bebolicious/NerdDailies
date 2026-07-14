import type { GameType, PuzzleDecor, ScreenEffectType } from '../../lib/types'
import {
  BANNER_PRESETS,
  parseColors,
  vignetteBackground,
  SCREEN_EFFECTS,
} from '../../lib/decor'
import { cn } from '../../lib/cn'
import { GuestBanner } from './GuestBanner'

// Admin editor block for a puzzle's decoration: the submitter credit, an
// optional custom banner (text + colors, overrides the credit), and an optional
// page-wide screen effect shown on finish. Reused by all game editors.
//
// bannerColor / bannerTextColor / effectColor are each stored as a comma-
// separated hex list — one value renders solid, 2+ render as a gradient (banner
// background can also be hard "stripes" per `bannerStyle`).

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

  const bannerColors = parseColors(value.bannerColor)
  const bannerStyle = value.bannerStyle ?? 'stripes'

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
      <div className="flex flex-col gap-3">
        <span className={labelCls}>Custom banner (optional — overrides submitter)</span>
        <input
          value={value.bannerText ?? ''}
          onChange={(e) => set({ bannerText: e.target.value })}
          placeholder="e.g. Bastille Day"
          className={inputCls}
        />

        {/* Preset flags / themes → fill the banner colors in one click */}
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Preset</span>
          <select
            value=""
            onChange={(e) => {
              const p = BANNER_PRESETS.find((x) => x.id === e.target.value)
              if (p) set({ bannerColor: p.colors, bannerStyle: p.style })
            }}
            className={inputCls}
          >
            <option value="">Pick a preset…</option>
            {BANNER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <ColorListField
          label="Banner colors (stripes / gradient)"
          value={value.bannerColor}
          fallback="#ff8ac0"
          onChange={(v) => set({ bannerColor: v })}
          hint="One color = solid. Add more for flag stripes or a gradient."
        />

        {bannerColors.length >= 2 && (
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Multi-color style</span>
            <div className="flex gap-2">
              {(['stripes', 'gradient'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set({ bannerStyle: s })}
                  className={cn(
                    'border-neo-2 px-3 py-1.5 text-[11px] font-display font-bold uppercase',
                    bannerStyle === s ? 'bg-ink text-paper-static' : 'bg-cream-soft hover:bg-paper',
                  )}
                >
                  {s === 'stripes' ? 'Hard stripes' : 'Smooth gradient'}
                </button>
              ))}
            </div>
          </div>
        )}

        <ColorListField
          label="Text color (optional — overrides auto contrast)"
          value={value.bannerTextColor}
          fallback="#1b1b3a"
          onChange={(v) => set({ bannerTextColor: v })}
          hint="Leave empty for automatic contrast. Add 2+ for gradient text."
        />

        {(value.bannerText?.trim() || value.submitter?.trim()) && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] text-ink-soft">Preview:</span>
            <div className="relative">
              <GuestBanner
                gameType={gameType}
                submitter={value.submitter}
                text={value.bannerText}
                color={value.bannerColor}
                textColor={value.bannerTextColor}
                style={bannerStyle}
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
          <div className="flex flex-col gap-3">
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
            <div className="flex items-end gap-3 flex-wrap">
              <ColorListField
                label="Effect / vignette color(s)"
                value={value.effectColor}
                fallback="#ff5d8f"
                onChange={(v) => set({ effectColor: v })}
                hint="Add 2+ for a multi-hue edge glow."
              />
              {parseColors(value.effectColor).length > 0 && (
                <div
                  className="border-neo-2 h-10 w-16 shrink-0"
                  title="Vignette preview"
                  style={{ background: vignetteBackground(parseColors(value.effectColor)) }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// A comma-separated hex-color list editor: a row of native color swatches with
// add / remove, plus a Clear. Empty list => empty string (caller stores null).
function ColorListField({
  label,
  value,
  fallback,
  onChange,
  hint,
}: {
  label: string
  value?: string
  fallback: string
  onChange: (v: string) => void
  hint?: string
}) {
  const colors = parseColors(value)
  const emit = (next: string[]) => onChange(next.join(','))

  return (
    <div className="flex flex-col gap-1">
      <span className={labelCls}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((c, i) => (
          <div key={i} className="flex items-center">
            <input
              type="color"
              value={c}
              onChange={(e) => emit(colors.map((x, j) => (j === i ? e.target.value : x)))}
              className="border-neo-2 h-9 w-10 cursor-pointer bg-cream-soft p-0.5"
              aria-label={`${label} swatch ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => emit(colors.filter((_, j) => j !== i))}
              className="border-neo-2 border-l-0 h-9 px-1.5 text-xs font-bold hover:bg-coral hover:text-ink-static"
              aria-label={`Remove color ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => emit([...colors, fallback])}
          className="border-neo-2 px-2 py-1.5 text-[10px] font-display font-bold uppercase hover:bg-lime hover:text-ink-static"
        >
          + Add
        </button>
        {colors.length > 0 && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="border-neo-2 px-2 py-1.5 text-[10px] font-display font-bold uppercase hover:bg-coral hover:text-ink-static"
          >
            Clear
          </button>
        )}
      </div>
      {hint && <span className="text-[10px] text-ink-soft">{hint}</span>}
    </div>
  )
}
