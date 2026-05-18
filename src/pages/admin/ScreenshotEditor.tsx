import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { X, Upload } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { GamePicker } from '../../components/game/GamePicker'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import type { IgdbGame } from '../../lib/types'
import { formatLong } from '../../lib/dates'

const SLOT_COUNT = 6

export function ScreenshotEditor() {
  const { date } = useParams<{ date: string }>()
  const [game, setGame] = useState<IgdbGame | null>(null)
  const [imagePaths, setImagePaths] = useState<(string | null)[]>(
    Array(SLOT_COUNT).fill(null),
  )
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      if (!sb || !date) {
        setLoading(false)
        return
      }
      const { data } = await sb
        .from('screenshot_puzzles')
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
        const paths = (data.image_paths as string[]) ?? []
        const padded = Array(SLOT_COUNT)
          .fill(null)
          .map((_, i) => paths[i] ?? null)
        setImagePaths(padded)
        setCoverPath((data.cover_path as string | null) ?? null)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date])

  async function uploadAt(index: number, file: File) {
    const sb = getSupabase()
    if (!sb || !date) return
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${date}/${index + 1}-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('screenshots')
      .upload(path, file, { upsert: true })
    if (error) {
      setMsg(`Upload failed: ${error.message}`)
      return
    }
    setImagePaths((prev) => {
      const next = [...prev]
      next[index] = path
      return next
    })
  }

  async function uploadCover(file: File) {
    const sb = getSupabase()
    if (!sb || !date) return
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${date}/cover-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('covers')
      .upload(path, file, { upsert: true })
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
        `Delete the screenshot puzzle for ${date} and every uploaded image/cover for that date? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)

    for (const bucket of ['screenshots', 'covers'] as const) {
      const { data: files, error: listErr } = await sb.storage
        .from(bucket)
        .list(date, { limit: 1000 })
      if (listErr) {
        setMsg(`Could not list ${bucket}: ${listErr.message}`)
        setClearing(false)
        return
      }
      if (files && files.length > 0) {
        const paths = files.map((f) => `${date}/${f.name}`)
        const { error: rmErr } = await sb.storage.from(bucket).remove(paths)
        if (rmErr) {
          setMsg(`Could not delete ${bucket} files: ${rmErr.message}`)
          setClearing(false)
          return
        }
      }
    }

    const { error: rowErr } = await sb
      .from('screenshot_puzzles')
      .delete()
      .eq('puzzle_date', date)
    if (rowErr) {
      setMsg(`Could not delete puzzle row: ${rowErr.message}`)
      setClearing(false)
      return
    }

    setGame(null)
    setImagePaths(Array(SLOT_COUNT).fill(null))
    setCoverPath(null)
    setMsg('Cleared.')
    setClearing(false)
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (!game) {
      setMsg('Pick a game first.')
      return
    }
    if (imagePaths.some((p) => !p)) {
      setMsg('All 6 screenshot slots must be filled.')
      return
    }
    setSaving(true)
    setMsg(null)
    const { error } = await sb.from('screenshot_puzzles').upsert(
      {
        puzzle_date: date,
        game_id: game.id,
        game_name: game.name,
        game_year: game.year,
        game_genre: game.genre,
        image_paths: imagePaths,
        cover_path: coverPath,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'puzzle_date' },
    )
    setSaving(false)
    setMsg(error ? `Save failed: ${error.message}` : 'Saved.')
  }

  return (
    <AdminLayout
      title={`Screenshot · ${date}`}
      subtitle={`Schedule for ${date && formatLong(date)}. Slot 1 = hardest, slot 6 = easiest.`}
    >
      {!isSupabaseConfigured() && <NotConfigured />}
      {loading ? (
        <div className="text-sm text-ink-soft">Loading…</div>
      ) : (
        <div className="flex flex-col gap-5">
          <NeoCard tone="paper" shadow="md" className="p-5">
            <GamePicker value={game} onChange={setGame} />
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
              Game cover
            </div>
            <div className="w-40">
              <CoverSlot
                path={coverPath}
                onUpload={uploadCover}
                onClear={() => setCoverPath(null)}
              />
            </div>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
              Six images (in order)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imagePaths.map((path, i) => (
                <Slot
                  key={i}
                  index={i}
                  path={path}
                  onUpload={(f) => uploadAt(i, f)}
                  onClear={() =>
                    setImagePaths((prev) => {
                      const next = [...prev]
                      next[i] = null
                      return next
                    })
                  }
                />
              ))}
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
              disabled={saving || clearing}
            >
              {clearing ? 'Clearing…' : 'Clear puzzle'}
            </NeoButton>
            <NeoButton
              tone="lime"
              onClick={save}
              disabled={saving || clearing}
            >
              {saving ? 'Saving…' : 'Save puzzle'}
            </NeoButton>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function Slot({
  index,
  path,
  onUpload,
  onClear,
}: {
  index: number
  path: string | null
  onUpload: (f: File) => void
  onClear: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const sb = getSupabase()
  const preview = path && sb ? sb.storage.from('screenshots').getPublicUrl(path).data.publicUrl : null
  return (
    <div className="border-neo bg-cream-soft aspect-[16/10] relative flex items-center justify-center overflow-hidden">
      {preview ? (
        <>
          <img src={preview} alt={`slot ${index + 1}`} className="w-full h-full object-cover [image-rendering:pixelated]" />
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
          className="flex flex-col items-center gap-1 text-ink-soft"
        >
          <Upload className="h-5 w-5 stroke-[2.5]" />
          <span className="font-display text-[10px] uppercase tracking-wider font-bold">
            #{index + 1}
            {index === SLOT_COUNT - 1 ? ' (easy)' : ''}
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
  const ref = useRef<HTMLInputElement>(null)
  const sb = getSupabase()
  const preview = path && sb ? sb.storage.from('covers').getPublicUrl(path).data.publicUrl : null
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
        <button
          onClick={() => ref.current?.click()}
          className="flex flex-col items-center gap-1 text-ink-soft px-2 text-center"
        >
          <Upload className="h-5 w-5 stroke-[2.5]" />
          <span className="font-display text-[10px] uppercase tracking-wider font-bold">
            Cover
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
  )
}

function NotConfigured() {
  return (
    <NeoCard tone="coral" shadow="sm" className="p-3 mb-4 text-sm">
      ⚠ Supabase not configured — uploads and saves will fail. Add{' '}
      <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
      <code>.env</code> and reload.
    </NeoCard>
  )
}
