import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { UploadZone } from '../../components/ui/UploadZone'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { PuzzleDecorFields } from '../../components/ui/PuzzleDecorFields'
import { rowToDecor, decorToRow } from '../../lib/decor'
import type { PuzzleDecor } from '../../lib/types'
import { GamePicker } from '../../components/game/GamePicker'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { compressImage, IMG_PRESETS } from '../../lib/imageCompress'
import type { Game } from '../../lib/types'
import { BLUR_LEVELS_PX } from '../../lib/types'
import { formatLong } from '../../lib/dates'

export function BlurEditor() {
  const { date } = useParams<{ date: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const [decor, setDecor] = useState<PuzzleDecor>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [previewStep, setPreviewStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      if (!sb || !date) {
        setLoading(false)
        return
      }
      const { data } = await sb
        .from('blur_puzzles')
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

  async function uploadCover(file: File) {
    const sb = getSupabase()
    if (!sb || !date) return
    const compressed = await compressImage(file, IMG_PRESETS.blurCover)
    const ext = compressed.name.split('.').pop() ?? 'webp'
    const path = `${date}/cover-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('covers')
      .upload(path, compressed, { upsert: true, cacheControl: '31536000' })
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
        `Delete the blur puzzle for ${date} and this puzzle's cover? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)

    // covers/ is shared with the Screenshot game — only delete this puzzle's cover.
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
      .from('blur_puzzles')
      .delete()
      .eq('puzzle_date', date)
    if (rowErr) {
      setMsg(`Could not delete puzzle row: ${rowErr.message}`)
      setClearing(false)
      return
    }

    setGame(null)
    setCoverPath(null)
    setDecor({})
    setMsg('Cleared.')
    setClearing(false)
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (!game) return setMsg('Pick a game first.')
    if (!coverPath) return setMsg('Upload the game cover first.')
    setSaving(true)
    setMsg(null)
    const { error } = await sb.from('blur_puzzles').upsert(
      {
        puzzle_date: date,
        game_id: game.id,
        game_name: game.name,
        game_year: game.year,
        game_genre: game.genre,
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
  const coverUrl =
    coverPath && sb
      ? sb.storage.from('covers').getPublicUrl(coverPath).data.publicUrl
      : null
  const blurPx = BLUR_LEVELS_PX[previewStep]

  return (
    <AdminLayout
      title={`Blur Reveal · ${date}`}
      subtitle={`Schedule for ${date && formatLong(date)}. One official game cover (portrait 3:4); client blurs/sharpens per wrong guess.`}
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
          <NeoCard tone="paper" shadow="md" className="p-5 flex flex-col gap-4">
            <GamePicker value={game} onChange={setGame} />
            <PuzzleDecorFields
              value={decor}
              onChange={setDecor}
              gameType="blur"
            />
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
              Game cover (blurs in 6 steps)
            </div>
            <div className="text-[11px] text-ink-soft mb-3">
              Portrait 3:4 — min 600 × 900 px.
            </div>
            <div className="w-48">
              <CoverSlot
                url={coverUrl}
                onUpload={uploadCover}
                onClear={() => setCoverPath(null)}
              />
            </div>
            {coverUrl && (
              <div className="mt-4">
                <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2">
                  Preview · step {previewStep + 1} of {BLUR_LEVELS_PX.length}
                  {' '}(blur {blurPx}px)
                </div>
                <div className="border-neo bg-cream-soft overflow-hidden w-48 aspect-[3/4] relative">
                  <img
                    src={coverUrl}
                    alt="preview"
                    className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-300 ease-out"
                    style={{
                      filter: `blur(${blurPx}px)`,
                      transform: blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
                    }}
                  />
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {BLUR_LEVELS_PX.map((px, i) => (
                    <button
                      key={i}
                      onClick={() => setPreviewStep(i)}
                      className={
                        'border-neo-2 px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold ' +
                        (i === previewStep
                          ? 'bg-lime text-ink-static'
                          : 'bg-paper hover:bg-cream-soft')
                      }
                    >
                      #{i + 1} · {px}px
                    </button>
                  ))}
                </div>
              </div>
            )}
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
    <div className="border-neo bg-cream-soft aspect-[3/4] relative flex items-center justify-center overflow-hidden">
      {url ? (
        <>
          <img src={url} alt="cover" className="w-full h-full object-cover" />
          <button
            onClick={onClear}
            className="absolute top-1 right-1 border-neo-2 bg-paper p-1"
          >
            <X className="h-3 w-3 stroke-[3]" />
          </button>
        </>
      ) : (
        <UploadZone onUpload={onUpload} label="Upload cover" />
      )}
    </div>
  )
}
