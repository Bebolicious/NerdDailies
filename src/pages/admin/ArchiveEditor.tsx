import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Plus, Trash2, Upload, X } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { PuzzleDecorFields } from '../../components/ui/PuzzleDecorFields'
import { rowToDecor, decorToRow } from '../../lib/decor'
import { GamePicker } from '../../components/game/GamePicker'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { compressImage, IMG_PRESETS } from '../../lib/imageCompress'
import { weekStartISO } from '../../lib/dates'
import { trimAndEncodeToMp3 } from '../../lib/audioTrim'
import {
  ARCHIVE_CONTAINER_META,
  ARCHIVE_HIDING_SPOTS,
  ARCHIVE_LINK_PRESETS,
  ARCHIVE_PRESETS,
  ARCHIVE_SUBJECTS,
  applyPreset,
  blankClue,
  clueIsComplete,
  findLinkPreset,
  findPreset,
  matchesLink,
} from '../../lib/archivePresets'
import {
  ARCHIVE_CONTAINERS,
  ARCHIVE_DEFAULT_CANDLES,
  ARCHIVE_MAX_WRONG,
  type ArchiveClue,
  type ArchiveClueSubject,
  type ArchiveContainer,
  type ArchiveHidingSpot,
  type ArchiveLink,
  type Game,
  type PuzzleDecor,
} from '../../lib/types'

// The Archive editor. The room is authored here as a flat `clues` list — one
// box or nine, whatever emoji and label you like — rather than filled into
// fixed "Box A / Box B / Box C" fields. Everything selectable comes from
// `lib/archivePresets.ts`, so adding a new kind of clue is a change there, not
// here.

const CACHE_FOREVER = '31536000' // puzzle assets are immutable once set.
const MAX_AUDIO_SECONDS = 30

const labelCls = 'font-display text-[10px] uppercase tracking-wider font-bold'
const inputCls =
  'border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper w-full'
const smallInputCls =
  'border-neo-2 bg-paper px-2 py-1 text-xs font-bold outline-none w-full'

function emptyLink(): ArchiveLink {
  const preset = ARCHIVE_LINK_PRESETS[0]
  return { preset: preset.id, prompt: preset.prompt, answer: '', accept: [] }
}

export function ArchiveEditor() {
  const { date } = useParams<{ date: string }>()
  // The Archive is weekly — snap whatever date the admin came in on to the
  // Monday of that week so this editor is idempotent within a week.
  const week = date ? weekStartISO(date) : null

  const [gameA, setGameA] = useState<Game | null>(null)
  const [gameB, setGameB] = useState<Game | null>(null)
  const [link, setLink] = useState<ArchiveLink>(emptyLink)
  const [weeklyTheme, setWeeklyTheme] = useState('')
  const [candles, setCandles] = useState(ARCHIVE_DEFAULT_CANDLES)
  const [clues, setClues] = useState<ArchiveClue[]>([])
  const [trashCrossed, setTrashCrossed] = useState('')
  const [decor, setDecor] = useState<PuzzleDecor>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [busyClue, setBusyClue] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      if (!sb || !week) {
        setLoading(false)
        return
      }
      const { data } = await sb
        .from('archive_puzzles')
        .select('*')
        .eq('puzzle_week', week)
        .maybeSingle()
      if (cancelled) return
      if (data) {
        setGameA({
          id: data.game_id,
          name: data.game_name,
          year: data.game_year ?? undefined,
          genre: data.game_genre ?? undefined,
        })
        if (data.game_b_id)
          setGameB({
            id: data.game_b_id,
            name: data.game_b_name,
            year: data.game_b_year ?? undefined,
            genre: data.game_b_genre ?? undefined,
          })
        setLink({
          preset: data.link_preset ?? 'custom',
          prompt: data.link_prompt ?? '',
          answer: data.link_answer ?? '',
          accept: data.link_accept ?? [],
        })
        setWeeklyTheme(data.weekly_theme ?? '')
        setCandles(data.candles ?? ARCHIVE_DEFAULT_CANDLES)
        setClues(Array.isArray(data.clues) ? (data.clues as ArchiveClue[]) : [])
        setTrashCrossed(data.trash_crossed_out ?? '')
        setDecor(rowToDecor(data))
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [week])

  // ── clue list mutation helpers ────────────────────────────────────────────

  function patchClue(id: string, patch: Partial<ArchiveClue>) {
    setClues((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function patchBody(id: string, patch: Record<string, unknown>) {
    setClues((prev) =>
      prev.map((c) =>
        c.id === id ? ({ ...c, body: { ...c.body, ...patch } } as ArchiveClue) : c,
      ),
    )
  }

  function addClue(container: ArchiveContainer) {
    setClues((prev) => [...prev, blankClue(container)])
  }

  function removeClue(id: string) {
    setClues((prev) => prev.filter((c) => c.id !== id))
  }

  // Move a clue within its own container. The list is flat, so we swap with
  // the nearest neighbour that shares the container rather than the raw index.
  function moveClue(id: string, dir: -1 | 1) {
    setClues((prev) => {
      const i = prev.findIndex((c) => c.id === id)
      if (i < 0) return prev
      const container = prev[i].container
      let j = i + dir
      while (j >= 0 && j < prev.length && prev[j].container !== container)
        j += dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function changePreset(clue: ArchiveClue, presetId: string) {
    setClues((prev) =>
      prev.map((c) => (c.id === clue.id ? applyPreset(c, presetId) : c)),
    )
  }

  // ── uploads ───────────────────────────────────────────────────────────────

  async function uploadClueImage(clue: ArchiveClue, file: File) {
    const sb = getSupabase()
    if (!sb || !week) return
    setBusyClue(clue.id)
    setMsg(null)
    try {
      const preset =
        clue.container === 'chest' ? IMG_PRESETS.archiveLogo : IMG_PRESETS.archiveFrame
      const compressed = await compressImage(file, preset)
      const ext = compressed.name.split('.').pop() ?? 'webp'
      const path = `${week}/clue-${clue.id}-${crypto.randomUUID()}.${ext}`
      const { error } = await sb.storage
        .from('archive')
        .upload(path, compressed, { upsert: true, cacheControl: CACHE_FOREVER })
      if (error) return setMsg(`Upload failed: ${error.message}`)
      patchBody(clue.id, { src: path })
    } finally {
      setBusyClue(null)
    }
  }

  async function uploadClueAudio(clue: ArchiveClue, file: File) {
    const sb = getSupabase()
    if (!sb || !week) return
    setBusyClue(clue.id)
    setMsg(null)
    try {
      let toUpload: File
      try {
        toUpload = await trimAndEncodeToMp3(file, MAX_AUDIO_SECONDS)
      } catch (e) {
        return setMsg(
          `Audio failed: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
      const path = `${week}/clue-${clue.id}-${crypto.randomUUID()}.mp3`
      const { error } = await sb.storage.from('archive').upload(path, toUpload, {
        upsert: true,
        contentType: 'audio/mpeg',
        cacheControl: CACHE_FOREVER,
      })
      if (error) return setMsg(`Audio upload failed: ${error.message}`)
      patchBody(clue.id, { src: path })
      setMsg(`Audio trimmed to ${MAX_AUDIO_SECONDS}s and uploaded.`)
    } finally {
      setBusyClue(null)
    }
  }

  // ── save / clear ──────────────────────────────────────────────────────────

  const incomplete = clues.filter((c) => !clueIsComplete(c))

  async function save() {
    const sb = getSupabase()
    if (!sb || !week) return
    if (!gameA) return setMsg('Pick subject A.')
    if (!gameB) return setMsg('Pick subject B.')
    if (gameA.id === gameB.id)
      return setMsg('Subject A and B must be two different games.')
    if (!link.answer.trim()) return setMsg('Set the link answer.')
    if (!link.prompt.trim())
      return setMsg('Write the prompt the player sees for the link.')
    if (clues.length === 0) return setMsg('Add at least one clue to the room.')
    if (incomplete.length > 0)
      return setMsg(
        `${incomplete.length} clue(s) are missing their content — fill them in or remove them.`,
      )
    setSaving(true)
    setMsg(null)
    const { error } = await sb.from('archive_puzzles').upsert(
      {
        puzzle_week: week,
        game_id: gameA.id,
        game_name: gameA.name,
        game_year: gameA.year,
        game_genre: gameA.genre,
        game_b_id: gameB.id,
        game_b_name: gameB.name,
        game_b_year: gameB.year,
        game_b_genre: gameB.genre,
        link_preset: link.preset,
        link_prompt: link.prompt.trim(),
        link_answer: link.answer.trim(),
        link_accept: link.accept.map((a) => a.trim()).filter(Boolean),
        weekly_theme: weeklyTheme || null,
        candles,
        clues,
        trash_crossed_out: trashCrossed.trim() || null,
        ...decorToRow(decor),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'puzzle_week' },
    )
    setSaving(false)
    setMsg(error ? `Save failed: ${error.message}` : 'Saved.')
  }

  async function clearPuzzle() {
    const sb = getSupabase()
    if (!sb || !week) return
    if (
      !window.confirm(
        `Delete the Archive puzzle for week of ${week} and every uploaded asset for that week? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)

    // The `archive` bucket is exclusive to this game, so wiping the whole
    // <week>/ prefix is safe and also clears orphans from unsaved sessions.
    const { data: files, error: listErr } = await sb.storage
      .from('archive')
      .list(week, { limit: 1000 })
    if (listErr) {
      setMsg(`Could not list archive files: ${listErr.message}`)
      setClearing(false)
      return
    }
    if (files && files.length > 0) {
      const paths = files.map((f) => `${week}/${f.name}`)
      const { error: rmErr } = await sb.storage.from('archive').remove(paths)
      if (rmErr) {
        setMsg(`Could not delete archive files: ${rmErr.message}`)
        setClearing(false)
        return
      }
    }
    const { error: rowErr } = await sb
      .from('archive_puzzles')
      .delete()
      .eq('puzzle_week', week)
    if (rowErr) {
      setMsg(`Could not delete puzzle row: ${rowErr.message}`)
      setClearing(false)
      return
    }
    setGameA(null)
    setGameB(null)
    setLink(emptyLink())
    setWeeklyTheme('')
    setCandles(ARCHIVE_DEFAULT_CANDLES)
    setClues([])
    setTrashCrossed('')
    setDecor({})
    setMsg('Cleared.')
    setClearing(false)
  }

  const sb = getSupabase()
  const url = (p: string) =>
    p && sb ? sb.storage.from('archive').getPublicUrl(p).data.publicUrl : null

  // How the week's clues are spread across the three answers — the whole point
  // of the rework is that no single answer can be carried by one lucky clue.
  const coverage = useMemo(() => {
    const counts: Record<ArchiveClueSubject, number> = {
      a: 0, b: 0, both: 0, link: 0, herring: 0,
    }
    for (const c of clues) counts[c.subject]++
    return counts
  }, [clues])

  const hidingUsed = clues.filter((c) => c.hiddenSpot).length

  return (
    <AdminLayout
      title={`The Archive · week of ${week}`}
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
          {/* ── The three answers ─────────────────────────────────────────── */}
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className={labelCls + ' mb-3'}>
              The answers · players must get all three
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className={labelCls + ' mb-1'}>Subject A</div>
                <GamePicker value={gameA} onChange={setGameA} />
              </div>
              <div>
                <div className={labelCls + ' mb-1'}>Subject B</div>
                <GamePicker value={gameB} onChange={setGameB} />
              </div>
            </div>
            <LinkFields value={link} onChange={setLink} />
          </NeoCard>

          {/* ── Week settings ─────────────────────────────────────────────── */}
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Weekly theme (optional)</span>
                <input
                  value={weeklyTheme}
                  onChange={(e) => setWeeklyTheme(e.target.value)}
                  placeholder="e.g. Games from the year 2000"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Candle budget</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={candles}
                  onChange={(e) =>
                    setCandles(
                      Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                    )
                  }
                  className={inputCls}
                />
                <span className="text-[10px] text-ink-soft">
                  Total clue cost is {clues.reduce((n, c) => n + c.cost, 0)}{' '}
                  candles across {clues.length} clue(s). Players also get{' '}
                  {ARCHIVE_MAX_WRONG} wrong guesses for the whole case.
                </span>
              </label>
            </div>
            <div className="mt-4">
              <PuzzleDecorFields
                value={decor}
                onChange={setDecor}
                gameType="archive"
              />
            </div>
          </NeoCard>

          {/* ── The room ──────────────────────────────────────────────────── */}
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className={labelCls + ' mb-1'}>The room</div>
            <div className="text-[11px] text-ink-soft mb-3">
              Add as many or as few clues as you want to each piece of
              furniture. A clue's subject stays hidden from the player until
              they've paid to open it.
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {ARCHIVE_SUBJECTS.map((s) => (
                <span
                  key={s.id}
                  className={
                    'border-neo-2 px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold ' +
                    (coverage[s.id] === 0 ? 'bg-cream-soft text-ink-soft' : 'bg-lime text-ink-static')
                  }
                >
                  {s.chip} · {coverage[s.id]}
                </span>
              ))}
              <span className="border-neo-2 px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold bg-cream-soft text-ink-soft">
                Hidden · {hidingUsed}
              </span>
            </div>

            <div className="flex flex-col gap-5">
              {ARCHIVE_CONTAINERS.map((container) => {
                const meta = ARCHIVE_CONTAINER_META[container]
                const mine = clues.filter((c) => c.container === container)
                return (
                  <div key={container} className="border-neo-2 border-dashed p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <div>
                        <div className={labelCls}>
                          {meta.label} · {mine.length}
                          {meta.max < 99 ? ` / ${meta.max}` : ''}
                        </div>
                        <div className="text-[10px] text-ink-soft">
                          {meta.blurb}
                        </div>
                      </div>
                      <NeoButton
                        tone="lime"
                        size="sm"
                        onClick={() => addClue(container)}
                        disabled={mine.length >= meta.max}
                      >
                        <Plus className="inline h-3 w-3 mr-1" /> Add
                      </NeoButton>
                    </div>
                    {mine.length === 0 ? (
                      <div className="text-[11px] text-ink-soft italic">
                        Empty — this furniture won't render in the room at all.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {mine.map((clue, i) => (
                          <ClueFields
                            key={clue.id}
                            clue={clue}
                            index={i}
                            count={mine.length}
                            busy={busyClue === clue.id}
                            previewUrl={
                              clue.body.kind !== 'text' ? url(clue.body.src) : null
                            }
                            onPatch={(patch) => patchClue(clue.id, patch)}
                            onPatchBody={(patch) => patchBody(clue.id, patch)}
                            onPreset={(id) => changePreset(clue, id)}
                            onMove={(dir) => moveClue(clue.id, dir)}
                            onRemove={() => removeClue(clue.id)}
                            onUploadImage={(f) => uploadClueImage(clue, f)}
                            onUploadAudio={(f) => uploadClueAudio(clue, f)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </NeoCard>

          {/* ── Trash flavor ──────────────────────────────────────────────── */}
          <NeoCard tone="paper" shadow="md" className="p-5">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>
                Trash · crossed-out wrong answer (optional)
              </span>
              <input
                value={trashCrossed}
                onChange={(e) => setTrashCrossed(e.target.value)}
                placeholder="Quake III Arena"
                className={inputCls}
              />
            </label>
            <div className="text-[10px] text-ink-soft mt-1">
              A plausible-looking wrong title. Shown as a crumpled scrap when a
              player rummages the trash. Setting this makes the bin searchable
              on its own, whether or not you've stashed a clue in it.
            </div>
          </NeoCard>

          {msg && (
            <NeoCard tone="mustard" shadow="sm" className="p-3 text-sm">
              {msg}
            </NeoCard>
          )}

          <div className="flex gap-3 justify-end flex-wrap items-center">
            {incomplete.length > 0 && (
              <span className="text-[11px] text-ink-soft mr-auto">
                {incomplete.length} clue(s) still missing content.
              </span>
            )}
            <NeoButton
              tone="coral"
              onClick={clearPuzzle}
              disabled={saving || clearing || !!busyClue}
            >
              {clearing ? 'Clearing…' : 'Clear puzzle'}
            </NeoButton>
            <NeoButton
              tone="lime"
              onClick={save}
              disabled={saving || clearing || !!busyClue}
            >
              {saving ? 'Saving…' : 'Save puzzle'}
            </NeoButton>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// ─── the link (third answer) ────────────────────────────────────────────────

function LinkFields({
  value,
  onChange,
}: {
  value: ArchiveLink
  onChange: (v: ArchiveLink) => void
}) {
  const [probe, setProbe] = useState('')
  const set = (patch: Partial<ArchiveLink>) => onChange({ ...value, ...patch })
  const preset = findLinkPreset(value.preset)

  return (
    <div className="mt-4 border-neo-2 border-dashed bg-cream-soft/40 p-4 flex flex-col gap-3">
      <div className={labelCls}>The link · asked after both games are named</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Category</span>
          <select
            value={value.preset}
            onChange={(e) => {
              const next = findLinkPreset(e.target.value)
              // Keep a hand-edited prompt; only re-seed if it was still the
              // outgoing preset's canned wording (or empty).
              const keepPrompt =
                value.prompt.trim() && value.prompt.trim() !== preset.prompt
              set({
                preset: next.id,
                prompt: keepPrompt ? value.prompt : next.prompt,
              })
            }}
            className={inputCls}
          >
            {ARCHIVE_LINK_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Answer</span>
          <input
            value={value.answer}
            onChange={(e) => set({ answer: e.target.value })}
            placeholder={preset.placeholder || 'The connection'}
            className={inputCls}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Prompt the player sees</span>
        <input
          value={value.prompt}
          onChange={(e) => set({ prompt: e.target.value })}
          placeholder="Both games came out the same year. Which year?"
          className={inputCls}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className={labelCls}>Also accept</span>
        <div className="text-[10px] text-ink-soft -mt-1 mb-1">
          Case, accents, punctuation and leading “the/a/an” are already ignored.
          Add alternates for genuinely different wordings.
        </div>
        {value.accept.map((alt, i) => (
          <div key={i} className="flex gap-2 mb-1">
            <input
              value={alt}
              onChange={(e) => {
                const next = [...value.accept]
                next[i] = e.target.value
                set({ accept: next })
              }}
              placeholder="y2k"
              className={inputCls}
            />
            <button
              onClick={() =>
                set({ accept: value.accept.filter((_, j) => j !== i) })
              }
              aria-label="Remove alternate"
              className="border-neo-2 bg-paper p-2 shrink-0"
            >
              <X className="h-3 w-3 stroke-[3]" />
            </button>
          </div>
        ))}
        <NeoButton
          tone="paper"
          size="sm"
          onClick={() => set({ accept: [...value.accept, ''] })}
        >
          <Plus className="inline h-3 w-3 mr-1" /> Add alternate
        </NeoButton>
      </div>

      {/* Try the matcher without leaving the editor. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Test a player answer</span>
        <input
          value={probe}
          onChange={(e) => setProbe(e.target.value)}
          placeholder="Type what a player might write…"
          className={inputCls}
        />
        {probe.trim() && (
          <span
            className={
              'text-[11px] font-bold ' +
              (matchesLink(probe, value) ? 'text-lime-deep' : 'text-coral')
            }
          >
            {matchesLink(probe, value) ? '✓ accepted' : '✗ rejected'}
          </span>
        )}
      </label>
    </div>
  )
}

// ─── one clue ───────────────────────────────────────────────────────────────

function ClueFields({
  clue,
  index,
  count,
  busy,
  previewUrl,
  onPatch,
  onPatchBody,
  onPreset,
  onMove,
  onRemove,
  onUploadImage,
  onUploadAudio,
}: {
  clue: ArchiveClue
  index: number
  count: number
  busy: boolean
  previewUrl: string | null
  onPatch: (patch: Partial<ArchiveClue>) => void
  onPatchBody: (patch: Record<string, unknown>) => void
  onPreset: (presetId: string) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onUploadImage: (f: File) => void
  onUploadAudio: (f: File) => void
}) {
  const preset = findPreset(clue.container, clue.preset)
  const complete = clueIsComplete(clue)

  return (
    <div
      className={
        'border-neo-2 p-3 flex flex-col gap-2 ' +
        (complete ? 'bg-cream-soft' : 'bg-coral/15')
      }
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-[10px] uppercase tracking-wider font-bold text-ink-soft">
          #{index + 1}
        </span>
        <select
          value={clue.preset}
          onChange={(e) => onPreset(e.target.value)}
          className={smallInputCls + ' flex-1'}
          aria-label="Clue preset"
        >
          {ARCHIVE_PRESETS[clue.container].map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Move up"
          className="border-neo-2 bg-paper p-1.5 disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3 stroke-[3]" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label="Move down"
          className="border-neo-2 bg-paper p-1.5 disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3 stroke-[3]" />
        </button>
        <button
          onClick={onRemove}
          aria-label="Remove clue"
          className="border-neo-2 bg-paper p-1.5 hover:bg-coral"
        >
          <Trash2 className="h-3 w-3 stroke-[3]" />
        </button>
      </div>

      {preset.hint && (
        <div className="text-[10px] text-ink-soft -mt-1">{preset.hint}</div>
      )}

      <div className="grid grid-cols-[64px_1fr] sm:grid-cols-[64px_1fr_1fr] gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Icon</span>
          <input
            value={clue.emoji}
            onChange={(e) => onPatch({ emoji: e.target.value })}
            placeholder="📦"
            maxLength={4}
            className={smallInputCls + ' text-center text-base'}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Name in the room</span>
          <input
            value={clue.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder={preset.name}
            className={smallInputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Points at</span>
          <select
            value={clue.subject}
            onChange={(e) =>
              onPatch({ subject: e.target.value as ArchiveClueSubject })
            }
            className={smallInputCls}
          >
            {ARCHIVE_SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Candle cost</span>
          <input
            type="number"
            min={0}
            max={9}
            value={clue.cost}
            onChange={(e) =>
              onPatch({
                cost: Math.max(0, Math.min(9, Number(e.target.value) || 0)),
              })
            }
            className={smallInputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Placement</span>
          <select
            value={clue.hiddenSpot ?? ''}
            onChange={(e) =>
              onPatch({
                hiddenSpot: (e.target.value || undefined) as
                  | ArchiveHidingSpot
                  | undefined,
              })
            }
            className={smallInputCls}
          >
            <option value="">Visible in the room</option>
            {ARCHIVE_HIDING_SPOTS.map((s) => (
              <option key={s.id} value={s.id}>
                Hidden · {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Body — whatever kind the preset calls for. */}
      {clue.body.kind === 'text' && (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Text</span>
          <textarea
            value={clue.body.text}
            onChange={(e) => onPatchBody({ text: e.target.value })}
            placeholder={preset.placeholder}
            rows={3}
            className={smallInputCls + ' resize-y'}
          />
        </label>
      )}

      {clue.body.kind === 'image' && (
        <div className="flex flex-col gap-2">
          <span className={labelCls}>Image</span>
          <ImageSlot
            url={previewUrl}
            busy={busy}
            onUpload={onUploadImage}
            onClear={() => onPatchBody({ src: '' })}
          />
          <label className="flex items-center gap-2 text-[11px] font-bold">
            <input
              type="checkbox"
              checked={!!clue.body.sharpens}
              onChange={(e) => onPatchBody({ sharpens: e.target.checked })}
            />
            Starts blurred, sharpens one step per wrong guess
          </label>
        </div>
      )}

      {clue.body.kind === 'audio' && (
        <div className="flex flex-col gap-2">
          <span className={labelCls}>Audio</span>
          {clue.body.src ? (
            <div className="border-neo-2 bg-paper p-2 flex items-center gap-2">
              <span className="flex-1 text-[11px] font-bold truncate">
                {clue.body.src}
              </span>
              <button
                onClick={() => onPatchBody({ src: '' })}
                aria-label="Remove audio"
                className="border-neo-2 bg-cream-soft p-1"
              >
                <X className="h-3 w-3 stroke-[3]" />
              </button>
            </div>
          ) : (
            <AudioPicker
              onPick={onUploadAudio}
              busy={busy}
              seconds={MAX_AUDIO_SECONDS}
            />
          )}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Caption (optional)</span>
            <input
              value={clue.body.caption ?? ''}
              onChange={(e) => onPatchBody({ caption: e.target.value })}
              placeholder="Track 4 · “Main Theme”"
              className={smallInputCls}
            />
          </label>
        </div>
      )}
    </div>
  )
}

function ImageSlot({
  url,
  busy,
  onUpload,
  onClear,
}: {
  url: string | null
  busy: boolean
  onUpload: (f: File) => void
  onClear: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="border-neo bg-paper relative flex items-center justify-center overflow-hidden aspect-[4/3] max-w-[280px]">
      {url ? (
        <>
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            onClick={onClear}
            aria-label="Remove image"
            className="absolute top-1 right-1 border-neo-2 bg-paper p-1"
          >
            <X className="h-3 w-3 stroke-[3]" />
          </button>
        </>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="flex flex-col items-center gap-1 text-ink-soft px-2 text-center disabled:cursor-wait"
        >
          <Upload className="h-5 w-5 stroke-[2.5]" />
          <span className={labelCls}>{busy ? 'Uploading…' : 'Upload'}</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function AudioPicker({
  onPick,
  busy,
  seconds,
}: {
  onPick: (f: File) => void
  busy: boolean
  seconds: number
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="border-neo bg-paper w-full py-4 flex flex-col items-center justify-center gap-1 hover:bg-cream-soft disabled:opacity-60 disabled:cursor-wait"
      >
        <Upload className="h-5 w-5 stroke-[2.5]" />
        <span className={labelCls}>
          {busy
            ? `Trimming to ${seconds}s & encoding…`
            : `Upload clip (auto-trim ${seconds}s)`}
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
    </>
  )
}
