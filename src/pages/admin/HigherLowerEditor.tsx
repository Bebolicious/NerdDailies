import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { UploadZone } from '../../components/ui/UploadZone'
import { TagPill } from '../../components/ui/TagPill'
import { PuzzleDecorFields } from '../../components/ui/PuzzleDecorFields'
import { rowToDecor, decorToRow } from '../../lib/decor'
import type { PuzzleDecor } from '../../lib/types'
import { GamePicker } from '../../components/game/GamePicker'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { compressImage, IMG_PRESETS } from '../../lib/imageCompress'
import { weekStartISO } from '../../lib/dates'
import {
  HIGHERLOWER_CATEGORIES,
  HIGHERLOWER_PAIR_COUNT,
  type Game,
  type HigherLowerCategory,
  type HighLowPairType,
} from '../../lib/types'
import { cn } from '../../lib/cn'

type SideForm = {
  game: Game | null
  value: string
  display: string
  coverPath: string | null
}

type PairForm = {
  // id is server-assigned on first save; we track the local row key separately
  // so React keeps reordering stable.
  key: string
  pairType: HighLowPairType
  category: HigherLowerCategory
  a: SideForm
  b: SideForm
}

function emptySide(): SideForm {
  return { game: null, value: '', display: '', coverPath: null }
}

function emptyPair(seed: number): PairForm {
  return {
    key: `local-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    pairType: 'vs',
    category: 'metacritic',
    a: emptySide(),
    b: emptySide(),
  }
}

function defaultPairs(count: number): PairForm[] {
  return Array.from({ length: count }, (_, i) => emptyPair(i))
}

const CATEGORY_OPTIONS = Object.values(HIGHERLOWER_CATEGORIES)
// Single-game pair types (slider / piggyback) can only use categories that
// carry a SliderConfig.
const SLIDER_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter((c) => c.slider)

const PAIR_TYPE_LABELS: Record<HighLowPairType, string> = {
  vs: 'VS',
  slider: 'Slider',
  piggyback: 'Piggyback',
}

const PAIR_TYPE_BLURBS: Record<HighLowPairType, string> = {
  vs: 'Two games — players pick which side wins the stat.',
  slider: 'One game — each player slides to guess the exact value.',
  piggyback: 'One game — hot-seat bluff. Solo play auto-counts it correct.',
}

// True when a pair only needs a single game (side A).
function isSingle(t: HighLowPairType): boolean {
  return t !== 'vs'
}

export function HigherLowerEditor() {
  const { date } = useParams<{ date: string }>()
  const week = date ? weekStartISO(date) : null

  const [theme, setTheme] = useState('')
  const [decor, setDecor] = useState<PuzzleDecor>({})
  const [pairs, setPairs] = useState<PairForm[]>(() =>
    defaultPairs(HIGHERLOWER_PAIR_COUNT),
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      if (!sb || !week) {
        setLoading(false)
        return
      }
      const { data: puzzleRow } = await sb
        .from('higherlower_puzzles')
        .select('*')
        .eq('puzzle_week', week)
        .maybeSingle()
      if (cancelled) return
      if (!puzzleRow) {
        setLoading(false)
        return
      }
      setTheme(puzzleRow.theme ?? '')
      setDecor(rowToDecor(puzzleRow))
      const { data: pairRows } = await sb
        .from('higherlower_pairs')
        .select('*')
        .eq('puzzle_id', puzzleRow.id)
        .order('position', { ascending: true })
      if (cancelled) return
      const loaded: PairForm[] = (pairRows ?? []).map((r) => ({
        key: r.id,
        pairType: (r.pair_type as HighLowPairType) ?? 'vs',
        category: r.category as HigherLowerCategory,
        a: {
          game: {
            id: r.game_a_id,
            name: r.game_a_name,
            year: r.game_a_year ?? undefined,
          },
          value: String(r.game_a_value ?? ''),
          display: r.game_a_display ?? '',
          coverPath: r.game_a_cover_path ?? null,
        },
        b:
          r.game_b_id != null
            ? {
                game: {
                  id: r.game_b_id,
                  name: r.game_b_name,
                  year: r.game_b_year ?? undefined,
                },
                value: String(r.game_b_value ?? ''),
                display: r.game_b_display ?? '',
                coverPath: r.game_b_cover_path ?? null,
              }
            : emptySide(),
      }))
      // Pad with empty rows up to HIGHERLOWER_PAIR_COUNT so the admin always
      // sees a full sheet to fill in.
      while (loaded.length < HIGHERLOWER_PAIR_COUNT) {
        loaded.push(emptyPair(loaded.length))
      }
      setPairs(loaded)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [week])

  function patchPair(idx: number, patch: Partial<PairForm>) {
    setPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  function setPairType(idx: number, type: HighLowPairType) {
    setPairs((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p
        // Switching to a single-game type: force a slider-capable category if
        // the current one has no SliderConfig.
        const cat =
          isSingle(type) && !HIGHERLOWER_CATEGORIES[p.category].slider
            ? (SLIDER_CATEGORY_OPTIONS[0].id as HigherLowerCategory)
            : p.category
        return { ...p, pairType: type, category: cat }
      }),
    )
  }
  function patchSide(idx: number, side: 'a' | 'b', patch: Partial<SideForm>) {
    setPairs((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, [side]: { ...p[side], ...patch } } : p,
      ),
    )
  }

  async function uploadCover(idx: number, side: 'a' | 'b', file: File) {
    const sb = getSupabase()
    if (!sb || !week) return
    const compressed = await compressImage(file, IMG_PRESETS.higherlower)
    const ext = compressed.name.split('.').pop() ?? 'webp'
    const path = `${week}/p${idx}-${side}-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('higherlower')
      .upload(path, compressed, { upsert: true, cacheControl: '31536000' })
    if (error) {
      setMsg(`Cover upload failed: ${error.message}`)
      return
    }
    patchSide(idx, side, { coverPath: path })
  }

  function movePair(idx: number, delta: number) {
    setPairs((prev) => {
      const next = idx + delta
      if (next < 0 || next >= prev.length) return prev
      const out = prev.slice()
      const [row] = out.splice(idx, 1)
      out.splice(next, 0, row)
      return out
    })
  }

  function clearPair(idx: number) {
    setPairs((prev) =>
      prev.map((p, i) => (i === idx ? emptyPair(i) : p)),
    )
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !week) return
    // Only save pairs that are fully filled in. Allow saving an incomplete
    // gauntlet (partial weeks happen during authoring) but warn.
    const valid = pairs.filter((p) => isPairComplete(p))
    if (valid.length === 0)
      return setMsg('Fill in at least one pair before saving.')

    setSaving(true)
    setMsg(null)

    const { data: puzzleRow, error: puzErr } = await sb
      .from('higherlower_puzzles')
      .upsert(
        {
          puzzle_week: week,
          theme: theme.trim() || null,
          ...decorToRow(decor),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'puzzle_week' },
      )
      .select()
      .single()
    if (puzErr || !puzzleRow) {
      setSaving(false)
      return setMsg(`Save failed: ${puzErr?.message ?? 'no row returned'}`)
    }

    // Wipe-and-reinsert pairs so position renumbering, removals, and category
    // swaps all land cleanly in one save.
    const { error: delErr } = await sb
      .from('higherlower_pairs')
      .delete()
      .eq('puzzle_id', puzzleRow.id)
    if (delErr) {
      setSaving(false)
      return setMsg(`Save failed (clearing old pairs): ${delErr.message}`)
    }

    const rows = valid.map((p, i) => {
      const single = isSingle(p.pairType)
      return {
        puzzle_id: puzzleRow.id,
        position: i,
        pair_type: p.pairType,
        category: p.category,
        game_a_id: p.a.game!.id,
        game_a_name: p.a.game!.name,
        game_a_year: p.a.game!.year ?? null,
        game_a_value: Number(p.a.value),
        game_a_display: p.a.display.trim() || null,
        game_a_cover_path: p.a.coverPath,
        // Single-game pairs (slider/piggyback) store no side B.
        game_b_id: single ? null : p.b.game!.id,
        game_b_name: single ? null : p.b.game!.name,
        game_b_year: single ? null : (p.b.game!.year ?? null),
        game_b_value: single ? null : Number(p.b.value),
        game_b_display: single ? null : p.b.display.trim() || null,
        game_b_cover_path: single ? null : p.b.coverPath,
      }
    })
    const { error: insErr } = await sb
      .from('higherlower_pairs')
      .insert(rows)
    setSaving(false)
    if (insErr) return setMsg(`Save failed (inserting pairs): ${insErr.message}`)
    setMsg(
      `Saved ${valid.length} pair${valid.length === 1 ? '' : 's'}${
        valid.length < HIGHERLOWER_PAIR_COUNT
          ? ` (incomplete — target is ${HIGHERLOWER_PAIR_COUNT})`
          : ''
      }.`,
    )
  }

  async function clearPuzzle() {
    const sb = getSupabase()
    if (!sb || !week) return
    if (
      !window.confirm(
        `Delete the Higher/Lower puzzle for week of ${week} and every uploaded cover for that week? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)

    const { data: files, error: listErr } = await sb.storage
      .from('higherlower')
      .list(week, { limit: 1000 })
    if (listErr) {
      setMsg(`Could not list cover files: ${listErr.message}`)
      setClearing(false)
      return
    }
    if (files && files.length > 0) {
      const paths = files.map((f) => `${week}/${f.name}`)
      const { error: rmErr } = await sb.storage.from('higherlower').remove(paths)
      if (rmErr) {
        setMsg(`Could not delete covers: ${rmErr.message}`)
        setClearing(false)
        return
      }
    }
    // Cascade on the FK deletes the pairs.
    const { error: rowErr } = await sb
      .from('higherlower_puzzles')
      .delete()
      .eq('puzzle_week', week)
    if (rowErr) {
      setMsg(`Could not delete puzzle row: ${rowErr.message}`)
      setClearing(false)
      return
    }
    setTheme('')
    setDecor({})
    setPairs(defaultPairs(HIGHERLOWER_PAIR_COUNT))
    setMsg('Cleared.')
    setClearing(false)
  }

  const sb = getSupabase()
  const url = (p: string | null) =>
    p && sb ? sb.storage.from('higherlower').getPublicUrl(p).data.publicUrl : null
  const filledCount = pairs.filter((p) => isPairComplete(p)).length

  return (
    <AdminLayout
      title={`Higher / Lower · week of ${week}`}
      subtitle={
        date
          ? `URL date ${date} → snapped to Monday ${week}. Editing is per-week.`
          : ''
      }
    >
      {!isSupabaseConfigured() && (
        <NeoCard tone="coral" shadow="sm" className="p-3 mb-4 text-sm">
          ⚠ Supabase not configured — uploads and saves will fail.
        </NeoCard>
      )}
      {loading ? (
        <div className="text-sm text-ink-soft">Loading…</div>
      ) : (
        <div className="flex flex-col gap-5">
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <TagPill tone="teal">
                Weekly · {HIGHERLOWER_PAIR_COUNT} pairs
              </TagPill>
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
                {filledCount} / {HIGHERLOWER_PAIR_COUNT} complete
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-wider font-bold">
                Weekly theme (optional)
              </span>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. RPGs of the 2010s"
                className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
              />
            </label>
            <div className="mt-4">
              <PuzzleDecorFields
                value={decor}
                onChange={setDecor}
                gameType="higherlower"
              />
            </div>
          </NeoCard>

          {pairs.map((pair, idx) => (
            <PairEditor
              key={pair.key}
              idx={idx}
              pair={pair}
              total={pairs.length}
              onPairType={(t) => setPairType(idx, t)}
              onCategory={(c) => patchPair(idx, { category: c })}
              onSideGame={(side, g) => patchSide(idx, side, { game: g })}
              onSideValue={(side, v) => patchSide(idx, side, { value: v })}
              onSideDisplay={(side, v) => patchSide(idx, side, { display: v })}
              onUploadCover={(side, f) => uploadCover(idx, side, f)}
              onClearCover={(side) =>
                patchSide(idx, side, { coverPath: null })
              }
              onMoveUp={() => movePair(idx, -1)}
              onMoveDown={() => movePair(idx, 1)}
              onClear={() => clearPair(idx)}
              coverUrl={(p) => url(p)}
            />
          ))}

          {msg && (
            <NeoCard tone="mustard" shadow="sm" className="p-3 text-sm">
              {msg}
            </NeoCard>
          )}

          <div className="flex gap-3 justify-end flex-wrap sticky bottom-3 bg-cream/90 backdrop-blur border-neo-2 p-3">
            <NeoButton
              tone="coral"
              onClick={clearPuzzle}
              disabled={saving || clearing}
            >
              {clearing ? 'Clearing…' : 'Clear puzzle'}
            </NeoButton>
            <NeoButton
              tone="lime"
              onClick={save}
              disabled={saving || clearing}
            >
              {saving ? 'Saving…' : `Save (${filledCount} pair${filledCount === 1 ? '' : 's'})`}
            </NeoButton>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function sideComplete(s: SideForm): boolean {
  return (
    s.game !== null &&
    s.value.trim() !== '' &&
    !Number.isNaN(Number(s.value))
  )
}

function isPairComplete(p: PairForm): boolean {
  // Slider / piggyback only need side A (the single game + its true value).
  if (isSingle(p.pairType)) return sideComplete(p.a)
  return sideComplete(p.a) && sideComplete(p.b)
}

function PairEditor({
  idx,
  pair,
  total,
  onPairType,
  onCategory,
  onSideGame,
  onSideValue,
  onSideDisplay,
  onUploadCover,
  onClearCover,
  onMoveUp,
  onMoveDown,
  onClear,
  coverUrl,
}: {
  idx: number
  pair: PairForm
  total: number
  onPairType: (t: HighLowPairType) => void
  onCategory: (c: HigherLowerCategory) => void
  onSideGame: (side: 'a' | 'b', g: Game | null) => void
  onSideValue: (side: 'a' | 'b', v: string) => void
  onSideDisplay: (side: 'a' | 'b', v: string) => void
  onUploadCover: (side: 'a' | 'b', f: File) => void
  onClearCover: (side: 'a' | 'b') => void
  onMoveUp: () => void
  onMoveDown: () => void
  onClear: () => void
  coverUrl: (p: string | null) => string | null
}) {
  const cfg = HIGHERLOWER_CATEGORIES[pair.category]
  const complete = isPairComplete(pair)
  const single = isSingle(pair.pairType)
  const categoryOptions = single ? SLIDER_CATEGORY_OPTIONS : CATEGORY_OPTIONS
  return (
    <NeoCard tone="paper" shadow="md" className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className={cn(
              'font-display text-xl uppercase tracking-wider font-bold border-neo-2 px-3 py-1 tabular-nums',
              complete ? 'bg-lime text-ink-static' : 'bg-cream-soft',
            )}
          >
            Pair #{String(idx + 1).padStart(2, '0')}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold">
              Type
            </span>
            <div className="flex border-neo-2 overflow-hidden">
              {(['vs', 'slider', 'piggyback'] as HighLowPairType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPairType(t)}
                  className={cn(
                    'font-display text-[11px] uppercase tracking-wider font-bold px-2.5 py-1.5 border-r-[2px] border-stroke last:border-r-0',
                    pair.pairType === t
                      ? 'bg-teal text-ink-static'
                      : 'bg-paper hover:bg-cream-soft',
                  )}
                >
                  {PAIR_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold">
              Category
            </span>
            <select
              value={pair.category}
              onChange={(e) =>
                onCategory(e.target.value as HigherLowerCategory)
              }
              className="border-neo-2 bg-cream-soft px-2 py-1.5 text-sm font-bold"
            >
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onMoveUp}
            disabled={idx === 0}
            aria-label="Move up"
            className="border-neo-2 p-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-paper hover:bg-cream-soft"
          >
            <ArrowUp className="h-3 w-3 stroke-[3]" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={idx === total - 1}
            aria-label="Move down"
            className="border-neo-2 p-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-paper hover:bg-cream-soft"
          >
            <ArrowDown className="h-3 w-3 stroke-[3]" />
          </button>
          <button
            onClick={onClear}
            aria-label="Reset this pair"
            className="border-neo-2 p-1.5 bg-paper hover:bg-coral hover:text-ink-static"
          >
            <Trash2 className="h-3 w-3 stroke-[3]" />
          </button>
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-ink-soft font-display mb-1">
        ▸ {PAIR_TYPE_BLURBS[pair.pairType]}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink-soft font-display mb-3">
        ▸ Players will see:{' '}
        <em className="not-italic font-bold">
          {single ? `Guess the ${cfg.valueLabel}` : cfg.question}
        </em>
      </div>

      {single ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SideEditor
            label="Game"
            tone="lime"
            side={pair.a}
            coverUrl={coverUrl(pair.a.coverPath)}
            unitHint={cfg.unitHint}
            valueLabel="Correct answer (players guess this)"
            onGame={(g) => onSideGame('a', g)}
            onValue={(v) => onSideValue('a', v)}
            onDisplay={(v) => onSideDisplay('a', v)}
            onUpload={(f) => onUploadCover('a', f)}
            onClearCover={() => onClearCover('a')}
          />
          <div className="border-neo-2 bg-cream-soft/60 p-3 flex items-center justify-center text-center">
            <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft leading-relaxed">
              {pair.pairType === 'piggyback' ? 'Piggyback Bluff' : 'Slider'} ·
              single game
              <br />
              Slider range {cfg.slider?.min}–{cfg.slider?.max}
              {cfg.slider?.unit ? ` ${cfg.slider.unit}` : ''}
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SideEditor
            label="Side A"
            tone="lime"
            side={pair.a}
            coverUrl={coverUrl(pair.a.coverPath)}
            unitHint={cfg.unitHint}
            onGame={(g) => onSideGame('a', g)}
            onValue={(v) => onSideValue('a', v)}
            onDisplay={(v) => onSideDisplay('a', v)}
            onUpload={(f) => onUploadCover('a', f)}
            onClearCover={() => onClearCover('a')}
          />
          <SideEditor
            label="Side B"
            tone="blue"
            side={pair.b}
            coverUrl={coverUrl(pair.b.coverPath)}
            unitHint={cfg.unitHint}
            onGame={(g) => onSideGame('b', g)}
            onValue={(v) => onSideValue('b', v)}
            onDisplay={(v) => onSideDisplay('b', v)}
            onUpload={(f) => onUploadCover('b', f)}
            onClearCover={() => onClearCover('b')}
          />
        </div>
      )}

      {!single && pair.a.value && pair.b.value && complete && (
        <div className="mt-4 border-neo-2 bg-cream-soft px-3 py-2 text-xs flex items-center justify-between flex-wrap gap-2">
          <span className="font-display uppercase tracking-wider text-ink-soft">
            {cfg.lowerWins ? 'Lower value wins:' : 'Higher value wins:'}
          </span>
          <span className="font-display font-bold">
            {Number(pair.a.value) === Number(pair.b.value)
              ? '⟷ tied (both count as correct)'
              : (cfg.lowerWins
                    ? Number(pair.a.value) < Number(pair.b.value)
                    : Number(pair.a.value) > Number(pair.b.value))
                ? `← Side A · ${pair.a.game?.name}`
                : `Side B · ${pair.b.game?.name} →`}
          </span>
        </div>
      )}
    </NeoCard>
  )
}

function SideEditor({
  label,
  tone,
  side,
  coverUrl,
  unitHint,
  valueLabel = 'Value (numeric — compared as a number)',
  onGame,
  onValue,
  onDisplay,
  onUpload,
  onClearCover,
}: {
  label: string
  tone: 'lime' | 'blue'
  side: SideForm
  coverUrl: string | null
  unitHint: string
  valueLabel?: string
  onGame: (g: Game | null) => void
  onValue: (v: string) => void
  onDisplay: (v: string) => void
  onUpload: (f: File) => void
  onClearCover: () => void
}) {
  return (
    <div className="border-neo-2 bg-cream-soft p-3 flex flex-col gap-3">
      <TagPill tone={tone} className="self-start">
        {label}
      </TagPill>
      <GamePicker value={side.game} onChange={onGame} label="Game" />
      <label className="flex flex-col gap-1">
        <span className="font-display text-[10px] uppercase tracking-wider font-bold">
          {valueLabel}
        </span>
        <input
          inputMode="decimal"
          value={side.value}
          onChange={(e) => onValue(e.target.value)}
          placeholder={unitHint}
          className="border-neo-2 bg-paper px-2 py-1.5 text-sm font-bold tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-display text-[10px] uppercase tracking-wider font-bold">
          Display override (optional)
        </span>
        <input
          value={side.display}
          onChange={(e) => onDisplay(e.target.value)}
          placeholder="e.g. 1:42:35, $220M, 96%"
          className="border-neo-2 bg-paper px-2 py-1.5 text-sm font-bold"
        />
        <span className="text-[10px] text-ink-soft">
          Shown on the reveal card. Leave blank to display the raw number.
        </span>
      </label>
      <CoverSlot url={coverUrl} onUpload={onUpload} onClear={onClearCover} />
    </div>
  )
}

function CoverSlot({
  url,
  onUpload,
  onClear,
}: {
  url: string | null
  onUpload: (f: File) => void
  onClear: () => void
}) {
  return (
    <div>
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
        Cover (optional)
      </div>
      <div className="border-neo-2 bg-paper relative flex items-center justify-center overflow-hidden aspect-[3/2]">
        {url ? (
          <>
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              onClick={onClear}
              className="absolute top-1 right-1 border-neo-2 bg-paper p-1"
            >
              <X className="h-3 w-3 stroke-[3]" />
            </button>
          </>
        ) : (
          <UploadZone onUpload={onUpload} label="Upload" iconClassName="h-4 w-4" />
        )}
      </div>
    </div>
  )
}
