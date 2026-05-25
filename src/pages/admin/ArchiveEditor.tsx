import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, X } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { GamePicker } from '../../components/game/GamePicker'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import type {
  ArchiveMysteryBox,
  ArchiveMysteryBoxOutcome,
  IgdbGame,
} from '../../lib/types'
import { weekStartISO } from '../../lib/dates'
import { trimAndEncodeToMp3 } from '../../lib/audioTrim'

const MAX_AUDIO_SECONDS = 30
const OUTCOMES: ArchiveMysteryBoxOutcome[] = [
  'jackpot',
  'clue',
  'redHerring',
  'lore',
]

export function ArchiveEditor() {
  const { date } = useParams<{ date: string }>()
  // The Archive game is weekly — snap whatever date the admin came in on to
  // the Monday of that week so this editor is idempotent within a week.
  const week = date ? weekStartISO(date) : null

  const [game, setGame] = useState<IgdbGame | null>(null)
  const [weeklyTheme, setWeeklyTheme] = useState('')
  const [clueYear, setClueYear] = useState('')
  const [clueGenre, setClueGenre] = useState('')
  const [cluePlatform, setCluePlatform] = useState('')
  const [cluePitch, setCluePitch] = useState('')
  const [clueMemo, setClueMemo] = useState('')
  const [clueReview, setClueReview] = useState('')

  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [frame1Path, setFrame1Path] = useState<string | null>(null)
  const [frame2Path, setFrame2Path] = useState<string | null>(null)
  const [chestPath, setChestPath] = useState<string | null>(null)

  const [mysteryA, setMysteryA] = useState<ArchiveMysteryBox>({
    type: 'lore',
    text: '',
  })
  const [mysteryB, setMysteryB] = useState<ArchiveMysteryBox>({
    type: 'redHerring',
    text: '',
    game: '',
  })
  const [trashCrossed, setTrashCrossed] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [processingAudio, setProcessingAudio] = useState(false)
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
        setGame({
          id: data.game_id,
          name: data.game_name,
          year: data.game_year ?? undefined,
          genre: data.game_genre ?? undefined,
        })
        setWeeklyTheme(data.weekly_theme ?? '')
        setClueYear(data.clue_year ?? '')
        setClueGenre(data.clue_genre ?? '')
        setCluePlatform(data.clue_platform ?? '')
        setCluePitch(data.clue_pitch ?? '')
        setClueMemo(data.clue_memo ?? '')
        setClueReview(data.clue_review ?? '')
        setAudioPath(data.audio_path ?? null)
        setFrame1Path(data.frame1_path ?? null)
        setFrame2Path(data.frame2_path ?? null)
        setChestPath(data.chest_logo_path ?? null)
        setMysteryA(data.mystery_a as ArchiveMysteryBox)
        setMysteryB(data.mystery_b as ArchiveMysteryBox)
        setTrashCrossed(data.trash_crossed_out ?? '')
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [week])

  async function uploadImage(
    file: File,
    kind: 'frame1' | 'frame2' | 'chest',
  ) {
    const sb = getSupabase()
    if (!sb || !week) return
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${week}/${kind}-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('archive')
      .upload(path, file, { upsert: true })
    if (error) {
      setMsg(`${kind} upload failed: ${error.message}`)
      return
    }
    if (kind === 'frame1') setFrame1Path(path)
    if (kind === 'frame2') setFrame2Path(path)
    if (kind === 'chest') setChestPath(path)
  }

  async function uploadAudio(file: File) {
    const sb = getSupabase()
    if (!sb || !week) return
    setProcessingAudio(true)
    setMsg(null)
    let toUpload: File
    try {
      toUpload = await trimAndEncodeToMp3(file, MAX_AUDIO_SECONDS)
    } catch (e) {
      setMsg(`Audio failed: ${e instanceof Error ? e.message : String(e)}`)
      setProcessingAudio(false)
      return
    }
    const path = `${week}/radio-${crypto.randomUUID()}.mp3`
    const { error } = await sb.storage
      .from('archive')
      .upload(path, toUpload, { upsert: true, contentType: 'audio/mpeg' })
    setProcessingAudio(false)
    if (error) return setMsg(`Audio upload failed: ${error.message}`)
    setAudioPath(path)
    setMsg(`Audio trimmed to ${MAX_AUDIO_SECONDS}s and uploaded.`)
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !week) return
    if (!game) return setMsg('Pick a game first.')
    if (!frame1Path) return setMsg('Upload Frame 1 (gameplay).')
    if (!frame2Path) return setMsg('Upload Frame 2 (key art).')
    if (!chestPath) return setMsg('Upload the chest logo crop.')
    if (!mysteryA.text.trim()) return setMsg('Fill in Mystery Box A.')
    if (!mysteryB.text.trim()) return setMsg('Fill in Mystery Box B.')
    if (!trashCrossed.trim()) return setMsg('Set the crossed-out trash title.')
    setSaving(true)
    setMsg(null)
    const { error } = await sb.from('archive_puzzles').upsert(
      {
        puzzle_week: week,
        game_id: game.id,
        game_name: game.name,
        game_year: game.year,
        game_genre: game.genre,
        clue_year: clueYear,
        clue_genre: clueGenre,
        clue_platform: cluePlatform,
        clue_pitch: cluePitch,
        clue_memo: clueMemo,
        clue_review: clueReview,
        weekly_theme: weeklyTheme || null,
        audio_path: audioPath || null,
        frame1_path: frame1Path,
        frame2_path: frame2Path,
        chest_logo_path: chestPath,
        mystery_a: mysteryA,
        mystery_b: mysteryB,
        trash_crossed_out: trashCrossed,
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
    setGame(null)
    setAudioPath(null)
    setFrame1Path(null)
    setFrame2Path(null)
    setChestPath(null)
    setMysteryA({ type: 'lore', text: '' })
    setMysteryB({ type: 'redHerring', text: '', game: '' })
    setTrashCrossed('')
    setMsg('Cleared.')
    setClearing(false)
  }

  const sb = getSupabase()
  const url = (p: string | null) =>
    p && sb ? sb.storage.from('archive').getPublicUrl(p).data.publicUrl : null

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
          <NeoCard tone="paper" shadow="md" className="p-5">
            <GamePicker value={game} onChange={setGame} />
            <label className="mt-4 flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-wider font-bold">
                Weekly theme (optional)
              </span>
              <input
                value={weeklyTheme}
                onChange={(e) => setWeeklyTheme(e.target.value)}
                placeholder="e.g. Games from the year 2000"
                className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
              />
            </label>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
              Shelf clues (1 candle each)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <TextField
                label="Box A · Year"
                value={clueYear}
                onChange={setClueYear}
                placeholder="2000"
              />
              <TextField
                label="Box B · Genre"
                value={clueGenre}
                onChange={setClueGenre}
                placeholder="Immersive Sim"
              />
              <TextField
                label="Box C · Platform"
                value={cluePlatform}
                onChange={setCluePlatform}
                placeholder="PC, PS2"
              />
            </div>
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mt-5 mb-3">
              Cabinet clues (1 candle each)
            </div>
            <div className="flex flex-col gap-3">
              <TextField
                label="Top drawer · Pitch (magazine-style one-liner)"
                value={cluePitch}
                onChange={setCluePitch}
                multiline
              />
              <TextField
                label="Middle drawer · Fake internal dev memo"
                value={clueMemo}
                onChange={setClueMemo}
                multiline
              />
              <TextField
                label="Bottom drawer · Fake review (score + snippet)"
                value={clueReview}
                onChange={setClueReview}
                multiline
              />
            </div>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
              Wall frames (sharpen with each wrong guess)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ImageSlot
                label="Frame 1 · Gameplay"
                url={url(frame1Path)}
                onUpload={(f) => uploadImage(f, 'frame1')}
                onClear={() => setFrame1Path(null)}
                aspect="aspect-[4/3]"
              />
              <ImageSlot
                label="Frame 2 · Key art"
                url={url(frame2Path)}
                onUpload={(f) => uploadImage(f, 'frame2')}
                onClear={() => setFrame2Path(null)}
                aspect="aspect-[4/3]"
              />
              <ImageSlot
                label="Sealed chest · Partial logo (2 candles)"
                url={url(chestPath)}
                onUpload={(f) => uploadImage(f, 'chest')}
                onClear={() => setChestPath(null)}
                aspect="aspect-[4/3]"
              />
            </div>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
              Radio · OST snippet (optional, 1 candle to listen)
            </div>
            {audioPath ? (
              <div className="border-neo bg-cream-soft p-3 flex items-center gap-3">
                <span className="flex-1 text-xs font-bold truncate">
                  {audioPath}
                </span>
                <button
                  onClick={() => setAudioPath(null)}
                  className="border-neo-2 bg-paper p-1.5"
                >
                  <X className="h-3 w-3 stroke-[3]" />
                </button>
              </div>
            ) : (
              <AudioPicker
                onPick={uploadAudio}
                busy={processingAudio}
                seconds={MAX_AUDIO_SECONDS}
              />
            )}
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
              Mystery boxes
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MysteryFields
                label="A · behind the bookshelf"
                value={mysteryA}
                onChange={setMysteryA}
              />
              <MysteryFields
                label="B · in the trash can"
                value={mysteryB}
                onChange={setMysteryB}
              />
            </div>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <TextField
              label="Trash · crossed-out wrong answer"
              value={trashCrossed}
              onChange={setTrashCrossed}
              placeholder="Quake III Arena"
            />
            <div className="text-[10px] text-ink-soft mt-1">
              A plausible-looking wrong title. Players who rummage the trash may
              find it crumpled and crossed out.
            </div>
          </NeoCard>

          {msg && (
            <NeoCard tone="mustard" shadow="sm" className="p-3 text-sm">
              {msg}
            </NeoCard>
          )}

          <div className="flex gap-3 justify-end flex-wrap">
            <NeoButton
              tone="coral"
              onClick={clearPuzzle}
              disabled={saving || clearing || processingAudio}
            >
              {clearing ? 'Clearing…' : 'Clear puzzle'}
            </NeoButton>
            <NeoButton
              tone="lime"
              onClick={save}
              disabled={saving || clearing || processingAudio}
            >
              {saving ? 'Saving…' : 'Save puzzle'}
            </NeoButton>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper resize-y"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
        />
      )}
    </label>
  )
}

function ImageSlot({
  label,
  url,
  onUpload,
  onClear,
  aspect = 'aspect-[4/3]',
}: {
  label: string
  url: string | null
  onUpload: (f: File) => void
  onClear: () => void
  aspect?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
        {label}
      </div>
      <div
        className={
          'border-neo bg-cream-soft relative flex items-center justify-center overflow-hidden ' +
          aspect
        }
      >
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
          <button
            onClick={() => ref.current?.click()}
            className="flex flex-col items-center gap-1 text-ink-soft px-2 text-center"
          >
            <Upload className="h-5 w-5 stroke-[2.5]" />
            <span className="font-display text-[10px] uppercase tracking-wider font-bold">
              Upload
            </span>
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
        className="border-neo bg-cream-soft w-full py-6 flex flex-col items-center justify-center gap-2 hover:bg-paper disabled:opacity-60 disabled:cursor-wait"
      >
        <Upload className="h-6 w-6 stroke-[2.5]" />
        <span className="font-display text-xs uppercase tracking-wider font-bold">
          {busy
            ? `Trimming to ${seconds}s & encoding…`
            : `Upload OST clip (auto-trim ${seconds}s)`}
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

function MysteryFields({
  label,
  value,
  onChange,
}: {
  label: string
  value: ArchiveMysteryBox
  onChange: (v: ArchiveMysteryBox) => void
}) {
  return (
    <div className="border-neo-2 bg-cream-soft p-3 flex flex-col gap-2">
      <div className="font-display text-[10px] uppercase tracking-wider font-bold">
        {label}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
          Outcome
        </span>
        <select
          value={value.type}
          onChange={(e) =>
            onChange({
              ...value,
              type: e.target.value as ArchiveMysteryBoxOutcome,
            })
          }
          className="border-neo-2 bg-paper px-2 py-1 text-xs font-bold"
        >
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      {value.type === 'redHerring' && (
        <label className="flex flex-col gap-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
            Different game (flavor)
          </span>
          <input
            value={value.game ?? ''}
            onChange={(e) => onChange({ ...value, game: e.target.value })}
            placeholder="System Shock 2"
            className="border-neo-2 bg-paper px-2 py-1 text-xs font-bold"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
          Text
        </span>
        <textarea
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          rows={3}
          className="border-neo-2 bg-paper px-2 py-1 text-xs font-bold resize-y"
        />
      </label>
    </div>
  )
}
