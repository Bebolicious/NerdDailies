import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, X, Play, Pause } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { UploadZone } from '../../components/ui/UploadZone'
import { PuzzleDecorFields } from '../../components/ui/PuzzleDecorFields'
import { rowToDecor, decorToRow } from '../../lib/decor'
import type { PuzzleDecor } from '../../lib/types'
import { GamePicker } from '../../components/game/GamePicker'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { compressImage, IMG_PRESETS } from '../../lib/imageCompress'
import type { Game } from '../../lib/types'
import { formatLong } from '../../lib/dates'
import { trimAndEncodeToMp3 } from '../../lib/audioTrim'

const MAX_SECONDS = 60
const CACHE_FOREVER = '31536000' // puzzle assets are immutable once set.

export function SoundtrackEditor() {
  const { date } = useParams<{ date: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [trackTitle, setTrackTitle] = useState('')
  const [revealStart, setRevealStart] = useState('0')
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const [decor, setDecor] = useState<PuzzleDecor>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [playing, setPlaying] = useState(false)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      if (!sb || !date) {
        setLoading(false)
        return
      }
      const { data } = await sb
        .from('soundtrack_puzzles')
        .select('*')
        .eq('puzzle_date', date)
        .maybeSingle()
      if (cancelled) return
      if (data) {
        setGame({
          id: data.game_id,
          name: data.game_name,
          year: data.game_year ?? undefined,
          genre: data.game_genre ?? undefined,
        })
        setAudioPath(data.audio_path)
        setTrackTitle(data.track_title ?? '')
        setRevealStart(String(data.reveal_start_seconds ?? 0))
        setCoverPath((data.cover_path as string | null) ?? null)
        setDecor(rowToDecor(data))
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date])

  async function uploadAudio(file: File) {
    const sb = getSupabase()
    if (!sb || !date) return
    setProcessing(true)
    setMsg(null)
    let toUpload: File
    try {
      toUpload = await trimAndEncodeToMp3(file, MAX_SECONDS)
    } catch (e) {
      setMsg(
        `Could not process audio: ${e instanceof Error ? e.message : String(e)}`,
      )
      setProcessing(false)
      return
    }
    const path = `${date}/${crypto.randomUUID()}.mp3`
    const { error } = await sb.storage
      .from('soundtracks')
      .upload(path, toUpload, {
        upsert: true,
        contentType: 'audio/mpeg',
        cacheControl: CACHE_FOREVER,
      })
    setProcessing(false)
    if (error) {
      setMsg(`Upload failed: ${error.message}`)
      return
    }
    setAudioPath(path)
    setMsg(`Trimmed to ${MAX_SECONDS}s and uploaded.`)
  }

  async function uploadCover(file: File) {
    const sb = getSupabase()
    if (!sb || !date) return
    const compressed = await compressImage(file, IMG_PRESETS.cover)
    const ext = compressed.name.split('.').pop() ?? 'webp'
    const path = `${date}/cover-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('covers')
      .upload(path, compressed, { upsert: true, cacheControl: CACHE_FOREVER })
    if (error) {
      setMsg(`Cover upload failed: ${error.message}`)
      return
    }
    setCoverPath(path)
  }

  async function clearPuzzle() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (
      !window.confirm(
        `Delete the soundtrack puzzle for ${date}, every uploaded audio file for that date, and this puzzle's cover? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)

    if (audioRef.current) {
      audioRef.current.pause()
      setPlaying(false)
    }

    const { data: files, error: listErr } = await sb.storage
      .from('soundtracks')
      .list(date, { limit: 1000 })
    if (listErr) {
      setMsg(`Could not list soundtracks: ${listErr.message}`)
      setClearing(false)
      return
    }
    if (files && files.length > 0) {
      const paths = files.map((f) => `${date}/${f.name}`)
      const { error: rmErr } = await sb.storage
        .from('soundtracks')
        .remove(paths)
      if (rmErr) {
        setMsg(`Could not delete audio files: ${rmErr.message}`)
        setClearing(false)
        return
      }
    }

    // covers/ is shared with Screenshot/Blur/Trophy — only delete this
    // puzzle's cover, never the whole date prefix.
    if (coverPath) {
      const { error: coverErr } = await sb.storage
        .from('covers')
        .remove([coverPath])
      if (coverErr) {
        setMsg(`Could not delete cover file: ${coverErr.message}`)
        setClearing(false)
        return
      }
    }

    const { error: rowErr } = await sb
      .from('soundtrack_puzzles')
      .delete()
      .eq('puzzle_date', date)
    if (rowErr) {
      setMsg(`Could not delete puzzle row: ${rowErr.message}`)
      setClearing(false)
      return
    }

    setGame(null)
    setAudioPath(null)
    setTrackTitle('')
    setRevealStart('0')
    setCoverPath(null)
    setDecor({})
    setMsg('Cleared.')
    setClearing(false)
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (!game) return setMsg('Pick a game first.')
    if (!audioPath) return setMsg('Upload an audio file first.')
    setSaving(true)
    setMsg(null)
    const { error } = await sb.from('soundtrack_puzzles').upsert(
      {
        puzzle_date: date,
        game_id: game.id,
        game_name: game.name,
        game_year: game.year,
        game_genre: game.genre,
        audio_path: audioPath,
        track_title: trackTitle || null,
        reveal_start_seconds: Number(revealStart) || 0,
        cover_path: coverPath,
        ...decorToRow(decor),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'puzzle_date' },
    )
    setSaving(false)
    setMsg(error ? `Save failed: ${error.message}` : 'Saved.')
  }

  const sb = getSupabase()
  const audioUrl =
    audioPath && sb
      ? sb.storage.from('soundtracks').getPublicUrl(audioPath).data.publicUrl
      : null

  return (
    <AdminLayout
      title={`Soundtrack · ${date}`}
      subtitle={`Schedule for ${date && formatLong(date)}. Uploads are auto-trimmed to the first ${MAX_SECONDS}s and re-encoded as 128 kbps MP3. Reveal-start sets where the 1s/4s/8s/15s/30s/ALL window begins.`}
    >
      {!isSupabaseConfigured() && (
        <NeoCard tone="coral" shadow="sm" className="p-3 mb-4 text-sm">
          ⚠ Supabase not configured.
        </NeoCard>
      )}
      {loading ? (
        <div className="text-sm text-ink-soft">Loading…</div>
      ) : (
        <div className="flex flex-col gap-5">
          <NeoCard tone="paper" shadow="md" className="p-5 flex flex-col gap-4">
            <GamePicker value={game} onChange={setGame} />
            <PuzzleDecorFields
              value={decor}
              onChange={setDecor}
              gameType="soundtrack"
            />
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
              Game cover (shown on the answer-reveal card)
            </div>
            <div className="text-[11px] text-ink-soft mb-3">
              Portrait 3:4 — the official cover players see after the round ends.
            </div>
            <div className="w-40">
              <CoverSlot
                path={coverPath}
                onUpload={uploadCover}
                onClear={() => setCoverPath(null)}
              />
            </div>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-wider font-bold">
                Track title (optional)
              </span>
              <input
                value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value)}
                placeholder="Main Theme"
                className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-wider font-bold">
                Reveal start (seconds from track start)
              </span>
              <input
                type="number"
                step="0.1"
                value={revealStart}
                onChange={(e) => setRevealStart(e.target.value)}
                className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold w-32 outline-none focus:bg-paper"
              />
              <span className="text-[10px] text-ink-soft">
                Each step plays {`{1, 4, 8, 15, 30, ALL}`} seconds starting from
                here.
              </span>
            </label>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
              Audio file
            </div>
            {audioUrl ? (
              <div className="border-neo bg-cream-soft p-3 flex items-center gap-3">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onEnded={() => setPlaying(false)}
                />
                <NeoButton
                  size="sm"
                  tone="lime"
                  onClick={() => {
                    const a = audioRef.current
                    if (!a) return
                    if (playing) {
                      a.pause()
                      setPlaying(false)
                    } else {
                      a.currentTime = Number(revealStart) || 0
                      a.play()
                      setPlaying(true)
                    }
                  }}
                >
                  {playing ? (
                    <>
                      <Pause className="inline h-3 w-3 mr-1" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="inline h-3 w-3 mr-1" /> Preview from reveal-start
                    </>
                  )}
                </NeoButton>
                <span className="flex-1 text-xs font-bold truncate">{audioPath}</span>
                <button
                  onClick={() => setAudioPath(null)}
                  className="border-neo-2 bg-paper p-1.5"
                >
                  <X className="h-3 w-3 stroke-[3]" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={processing}
                className="border-neo bg-cream-soft w-full py-6 flex flex-col items-center justify-center gap-2 hover:bg-paper disabled:opacity-60 disabled:cursor-wait"
              >
                <Upload className="h-6 w-6 stroke-[2.5]" />
                <span className="font-display text-xs uppercase tracking-wider font-bold">
                  {processing
                    ? `Trimming to ${MAX_SECONDS}s & encoding…`
                    : 'Upload audio (auto-trimmed to first ' + MAX_SECONDS + 's)'}
                </span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadAudio(f)
                e.target.value = ''
              }}
            />
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
              disabled={saving || clearing || processing}
            >
              {clearing ? 'Clearing…' : 'Clear puzzle'}
            </NeoButton>
            <NeoButton
              tone="lime"
              onClick={save}
              disabled={saving || clearing || processing}
            >
              {saving ? 'Saving…' : 'Save puzzle'}
            </NeoButton>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function CoverSlot({
  path,
  onUpload,
  onClear,
}: {
  path: string | null
  onUpload: (f: File) => void
  onClear: () => void
}) {
  const sb = getSupabase()
  const preview =
    path && sb ? sb.storage.from('covers').getPublicUrl(path).data.publicUrl : null
  return (
    <div className="border-neo bg-cream-soft aspect-[3/4] relative flex items-center justify-center overflow-hidden">
      {preview ? (
        <>
          <img src={preview} alt="cover" className="w-full h-full object-cover" />
          <button
            onClick={onClear}
            className="absolute top-1 right-1 border-neo-2 bg-paper p-1"
          >
            <X className="h-3 w-3 stroke-[3]" />
          </button>
        </>
      ) : (
        <UploadZone onUpload={onUpload} label="Cover" />
      )}
    </div>
  )
}
