import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
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
  AUCTION_MAX_GAMES,
  AUCTION_MIN_GAMES,
  HIGHERLOWER_CATEGORIES,
  HIGHERLOWER_PAIR_COUNT,
  type Game,
  type HigherLowerCategory,
  type HighLowPairType,
} from '../../lib/types'
import { cn } from '../../lib/cn'

type SideForm = {
  // Local row key so React keeps shelf rows stable across add/remove/reorder.
  key: string
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
  // The auction shelf. Only meaningful when pairType === 'auction'.
  games: SideForm[]
}

// One entry of the `games` JSONB shelf as stored on higherlower_pairs.
type AuctionGameRow = {
  game_id: number
  game_name: string
  game_year?: number | null
  value: number | string
  display?: string | null
  cover_path?: string | null
}

function localKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function emptySide(): SideForm {
  return {
    key: localKey('side'),
    game: null,
    value: '',
    display: '',
    coverPath: null,
  }
}

function emptyPair(seed: number): PairForm {
  return {
    key: `local-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    pairType: 'vs',
    category: 'metacritic',
    a: emptySide(),
    b: emptySide(),
    // A fresh auction shelf starts with two slots — the minimum playable round.
    games: [emptySide(), emptySide()],
  }
}

function defaultPairs(count: number): PairForm[] {
  return Array.from({ length: count }, (_, i) => emptyPair(i))
}

const CATEGORY_OPTIONS = Object.values(HIGHERLOWER_CATEGORIES)
// Slider rounds can only use categories that carry a SliderConfig (the slider
// needs a min/max/step). VS and auction rounds work with every category.
const SLIDER_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter((c) => c.slider)

const PAIR_TYPE_LABELS: Record<HighLowPairType, string> = {
  vs: 'VS',
  slider: 'Slider',
  auction: 'Auction',
}

const PAIR_TYPE_BLURBS: Record<HighLowPairType, string> = {
  vs: 'Two games — players pick which side wins the stat.',
  slider: 'One game — each player slides to guess the exact value.',
  auction: `A shelf of ${AUCTION_MIN_GAMES}–${AUCTION_MAX_GAMES} games — each player claims one on their turn, scored by where it really ranks.`,
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
      const loaded: PairForm[] = (pairRows ?? []).map((r) => {
        const shelf: SideForm[] = Array.isArray(r.games)
          ? (r.games as AuctionGameRow[]).map((g) => ({
              key: localKey('shelf'),
              game: {
                id: g.game_id,
                name: g.game_name,
                year: g.game_year ?? undefined,
              },
              value: String(g.value ?? ''),
              display: g.display ?? '',
              coverPath: g.cover_path ?? null,
            }))
          : []
        // Always leave the shelf at least minimum-length so the editor renders
        // a usable form even for a row saved half-finished.
        while (shelf.length < AUCTION_MIN_GAMES) shelf.push(emptySide())
        return {
          key: r.id,
          // 'piggyback' was removed; those rows are single-game + true value,
          // which is exactly a slider round.
          pairType:
            r.pair_type === 'piggyback'
              ? 'slider'
              : ((r.pair_type as HighLowPairType) ?? 'vs'),
          category: r.category as HigherLowerCategory,
          a: {
            key: localKey('side'),
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
                  key: localKey('side'),
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
          games: shelf,
        }
      })
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
        // Slider rounds need a category carrying a SliderConfig; swap to the
        // first slider-capable one if the current pick has none. VS and auction
        // accept every category.
        const cat =
          type === 'slider' && !HIGHERLOWER_CATEGORIES[p.category].slider
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
  // ── auction shelf ──
  function patchShelf(idx: number, slot: number, patch: Partial<SideForm>) {
    setPairs((prev) =>
      prev.map((p, i) =>
        i === idx
          ? {
              ...p,
              games: p.games.map((g, j) =>
                j === slot ? { ...g, ...patch } : g,
              ),
            }
          : p,
      ),
    )
  }
  function addShelfSlot(idx: number) {
    setPairs((prev) =>
      prev.map((p, i) =>
        i === idx && p.games.length < AUCTION_MAX_GAMES
          ? { ...p, games: [...p.games, emptySide()] }
          : p,
      ),
    )
  }
  function removeShelfSlot(idx: number, slot: number) {
    setPairs((prev) =>
      prev.map((p, i) =>
        i === idx && p.games.length > AUCTION_MIN_GAMES
          ? { ...p, games: p.games.filter((_, j) => j !== slot) }
          : p,
      ),
    )
  }
  function moveShelfSlot(idx: number, slot: number, delta: number) {
    setPairs((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p
        const next = slot + delta
        if (next < 0 || next >= p.games.length) return p
        const games = p.games.slice()
        const [row] = games.splice(slot, 1)
        games.splice(next, 0, row)
        return { ...p, games }
      }),
    )
  }

  // `slot` is 'a' | 'b' for vs/slider rows, or a shelf index for auction rows.
  async function uploadCover(idx: number, slot: 'a' | 'b' | number, file: File) {
    const sb = getSupabase()
    if (!sb || !week) return
    const compressed = await compressImage(file, IMG_PRESETS.higherlower)
    const ext = compressed.name.split('.').pop() ?? 'webp'
    const label = typeof slot === 'number' ? `g${slot}` : slot
    const path = `${week}/p${idx}-${label}-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('higherlower')
      .upload(path, compressed, { upsert: true, cacheControl: '31536000' })
    if (error) {
      setMsg(`Cover upload failed: ${error.message}`)
      return
    }
    if (typeof slot === 'number') patchShelf(idx, slot, { coverPath: path })
    else patchSide(idx, slot, { coverPath: path })
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
      const auction = p.pairType === 'auction'
      const shelf = auction ? p.games.filter(sideComplete) : []
      // Auction rows keep the whole shelf in `games` and mirror slot 0 into the
      // NOT NULL game_a_* columns; only vs rows populate side B.
      const primary = auction ? shelf[0] : p.a
      return {
        puzzle_id: puzzleRow.id,
        position: i,
        pair_type: p.pairType,
        category: p.category,
        game_a_id: primary.game!.id,
        game_a_name: primary.game!.name,
        game_a_year: primary.game!.year ?? null,
        game_a_value: Number(primary.value),
        game_a_display: primary.display.trim() || null,
        game_a_cover_path: primary.coverPath,
        game_b_id: p.pairType === 'vs' ? p.b.game!.id : null,
        game_b_name: p.pairType === 'vs' ? p.b.game!.name : null,
        game_b_year: p.pairType === 'vs' ? (p.b.game!.year ?? null) : null,
        game_b_value: p.pairType === 'vs' ? Number(p.b.value) : null,
        game_b_display: p.pairType === 'vs' ? p.b.display.trim() || null : null,
        game_b_cover_path: p.pairType === 'vs' ? p.b.coverPath : null,
        games: shelf.map((g) => ({
          game_id: g.game!.id,
          game_name: g.game!.name,
          game_year: g.game!.year ?? null,
          value: Number(g.value),
          display: g.display.trim() || null,
          cover_path: g.coverPath,
        })),
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
              onShelfPatch={(slot, patch) => patchShelf(idx, slot, patch)}
              onShelfUpload={(slot, f) => uploadCover(idx, slot, f)}
              onShelfAdd={() => addShelfSlot(idx)}
              onShelfRemove={(slot) => removeShelfSlot(idx, slot)}
              onShelfMove={(slot, delta) => moveShelfSlot(idx, slot, delta)}
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
  // Slider only needs side A (the single game + its true value).
  if (p.pairType === 'slider') return sideComplete(p.a)
  // Auction needs a shelf of at least AUCTION_MIN_GAMES filled slots. Partly
  // filled slots are simply dropped on save, so they don't block the pair.
  if (p.pairType === 'auction')
    return p.games.filter(sideComplete).length >= AUCTION_MIN_GAMES
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
  onShelfPatch,
  onShelfUpload,
  onShelfAdd,
  onShelfRemove,
  onShelfMove,
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
  onShelfPatch: (slot: number, patch: Partial<SideForm>) => void
  onShelfUpload: (slot: number, f: File) => void
  onShelfAdd: () => void
  onShelfRemove: (slot: number) => void
  onShelfMove: (slot: number, delta: number) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onClear: () => void
  coverUrl: (p: string | null) => string | null
}) {
  const cfg = HIGHERLOWER_CATEGORIES[pair.category]
  const complete = isPairComplete(pair)
  const isSlider = pair.pairType === 'slider'
  const isAuction = pair.pairType === 'auction'
  const categoryOptions = isSlider ? SLIDER_CATEGORY_OPTIONS : CATEGORY_OPTIONS
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
              {(['vs', 'slider', 'auction'] as HighLowPairType[]).map((t) => (
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
          {isSlider
            ? (cfg.sliderQuestion ?? `Guess the ${cfg.valueLabel}`)
            : isAuction
              ? (cfg.auctionQuestion ??
                `Pick the game with the ${cfg.lowerWins ? 'lowest' : 'highest'} ${cfg.valueLabel}`)
              : cfg.question}
        </em>
      </div>

      {isAuction ? (
        <ShelfEditor
          pair={pair}
          cfg={cfg}
          coverUrl={coverUrl}
          onPatch={onShelfPatch}
          onUpload={onShelfUpload}
          onAdd={onShelfAdd}
          onRemove={onShelfRemove}
          onMove={onShelfMove}
        />
      ) : isSlider ? (
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
              Slider · single game
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

      {pair.pairType === 'vs' && pair.a.value && pair.b.value && complete && (
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

// The auction shelf: an ordered list of games players can claim. Each slot is a
// compact row (cover thumb + game + value) rather than a full SideEditor card,
// because a shelf can hold ten of them and the sheet holds fifteen pairs.
function ShelfEditor({
  pair,
  cfg,
  coverUrl,
  onPatch,
  onUpload,
  onAdd,
  onRemove,
  onMove,
}: {
  pair: PairForm
  cfg: (typeof HIGHERLOWER_CATEGORIES)[HigherLowerCategory]
  coverUrl: (p: string | null) => string | null
  onPatch: (slot: number, patch: Partial<SideForm>) => void
  onUpload: (slot: number, f: File) => void
  onAdd: () => void
  onRemove: (slot: number) => void
  onMove: (slot: number, delta: number) => void
}) {
  const filled = pair.games.filter(sideComplete)
  // Preview the true ranking so the admin can sanity-check the payout order
  // before players ever see it.
  const ranked = [...filled].sort((a, b) =>
    cfg.lowerWins
      ? Number(a.value) - Number(b.value)
      : Number(b.value) - Number(a.value),
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TagPill tone="lime">
          Shelf · {filled.length} / {pair.games.length} filled
        </TagPill>
        <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
          {cfg.lowerWins ? 'Lowest' : 'Highest'} value pays 150 · needs ≥{' '}
          {AUCTION_MIN_GAMES}, max {AUCTION_MAX_GAMES}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {pair.games.map((g, slot) => (
          <ShelfSlotEditor
            key={g.key}
            slot={slot}
            side={g}
            total={pair.games.length}
            unitHint={cfg.unitHint}
            coverUrl={coverUrl(g.coverPath)}
            onGame={(game) => onPatch(slot, { game })}
            onValue={(v) => onPatch(slot, { value: v })}
            onDisplay={(v) => onPatch(slot, { display: v })}
            onUpload={(f) => onUpload(slot, f)}
            onClearCover={() => onPatch(slot, { coverPath: null })}
            onRemove={() => onRemove(slot)}
            onMoveUp={() => onMove(slot, -1)}
            onMoveDown={() => onMove(slot, 1)}
            canRemove={pair.games.length > AUCTION_MIN_GAMES}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <NeoButton
          tone="blue"
          size="sm"
          onClick={onAdd}
          disabled={pair.games.length >= AUCTION_MAX_GAMES}
        >
          <Plus className="inline h-3 w-3 stroke-[3] mr-1" /> Add game
        </NeoButton>
        {ranked.length >= 2 && (
          <div className="text-[10px] font-display uppercase tracking-wider text-ink-soft">
            ▸ Payout order: {ranked.map((g) => g.game?.name).join(' › ')}
          </div>
        )}
      </div>
    </div>
  )
}

function ShelfSlotEditor({
  slot,
  side,
  total,
  unitHint,
  coverUrl,
  onGame,
  onValue,
  onDisplay,
  onUpload,
  onClearCover,
  onRemove,
  onMoveUp,
  onMoveDown,
  canRemove,
}: {
  slot: number
  side: SideForm
  total: number
  unitHint: string
  coverUrl: string | null
  onGame: (g: Game | null) => void
  onValue: (v: string) => void
  onDisplay: (v: string) => void
  onUpload: (f: File) => void
  onClearCover: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canRemove: boolean
}) {
  const done = sideComplete(side)
  return (
    <div
      className={cn(
        'border-neo-2 p-3 flex gap-3 items-start flex-wrap md:flex-nowrap',
        done ? 'bg-cream-soft' : 'bg-cream-soft/50',
      )}
    >
      {/* Portrait cover — the shelf renders 3:4 art, so preview it that way. */}
      <div className="w-[64px] shrink-0">
        <div className="border-neo-2 bg-paper relative flex items-center justify-center overflow-hidden aspect-[3/4]">
          {coverUrl ? (
            <>
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
              <button
                onClick={onClearCover}
                className="absolute top-0.5 right-0.5 border-neo-2 bg-paper p-0.5"
                aria-label="Remove cover"
              >
                <X className="h-2.5 w-2.5 stroke-[3]" />
              </button>
            </>
          ) : (
            <UploadZone
              onUpload={onUpload}
              label=""
              iconClassName="h-4 w-4"
            />
          )}
        </div>
        <div className="font-display text-[9px] uppercase tracking-wider text-center text-ink-soft mt-1">
          Slot {slot + 1}
        </div>
      </div>

      <div className="flex-1 min-w-[200px] flex flex-col gap-2">
        <GamePicker value={side.game} onChange={onGame} label="Game" />
        <div className="flex gap-2 flex-wrap">
          <label className="flex flex-col gap-1 flex-1 min-w-[120px]">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold">
              Value
            </span>
            <input
              inputMode="decimal"
              value={side.value}
              onChange={(e) => onValue(e.target.value)}
              placeholder={unitHint}
              className="border-neo-2 bg-paper px-2 py-1.5 text-sm font-bold tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[120px]">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold">
              Display override
            </span>
            <input
              value={side.display}
              onChange={(e) => onDisplay(e.target.value)}
              placeholder="e.g. 96%, $220M"
              className="border-neo-2 bg-paper px-2 py-1.5 text-sm font-bold"
            />
          </label>
        </div>
      </div>

      <div className="flex md:flex-col items-center gap-1.5 shrink-0">
        <button
          onClick={onMoveUp}
          disabled={slot === 0}
          aria-label="Move game up"
          className="border-neo-2 p-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-paper hover:bg-cream-soft"
        >
          <ArrowUp className="h-3 w-3 stroke-[3]" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={slot === total - 1}
          aria-label="Move game down"
          className="border-neo-2 p-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-paper hover:bg-cream-soft"
        >
          <ArrowDown className="h-3 w-3 stroke-[3]" />
        </button>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="Remove this game"
          className="border-neo-2 p-1.5 bg-paper hover:bg-coral hover:text-ink-static disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-3 w-3 stroke-[3]" />
        </button>
      </div>
    </div>
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
