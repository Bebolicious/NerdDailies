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
  // Back Cover hard mode — an optional second round on this same day.
  const [backEnabled, setBackEnabled] = useState(false)
  const [backGame, setBackGame] = useState<Game | null>(null)
  const [backCoverPath, setBackCoverPath] = useState<string | null>(null)
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
        setBackEnabled(!!data.backcover_enabled)
        setBackCoverPath((data.backcover_path as string | null) ?? null)
        if (data.backcover_game_id) {
          setBackGame({
            id: data.backcover_game_id,
            name: data.backcover_game_name ?? '',
            year: data.backcover_game_year ?? undefined,
            genre: data.backcover_game_genre ?? undefined,
          })
        }
        setDecor(rowToDecor(data))
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date])

  // `slot` keeps the two covers in distinct filenames inside the shared
  // covers/<date>/ prefix, so clearing one never guesses at the other's path.
  async function uploadCover(file: File, slot: 'front' | 'back') {
    const sb = getSupabase()
    if (!sb || !date) return
    const compressed = await compressImage(file, IMG_PRESETS.blurCover)
    const ext = compressed.name.split('.').pop() ?? 'webp'
    const prefix = slot === 'back' ? 'backcover' : 'cover'
    const path = `${date}/${prefix}-${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage
      .from('covers')
      .upload(path, compressed, { upsert: true, cacheControl: '31536000' })
    if (error) {
      setMsg(`Cover upload failed: ${error.message}`)
      return
    }
    if (slot === 'back') setBackCoverPath(path)
    else setCoverPath(path)
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

    // covers/ is shared with the Screenshot game — only delete this puzzle's
    // own files (front cover, plus the back cover if hard mode was set up).
    const ownFiles = [coverPath, backCoverPath].filter(
      (p): p is string => !!p,
    )
    if (ownFiles.length > 0) {
      const { error: coverErr } = await sb.storage
        .from('covers')
        .remove(ownFiles)
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
    setBackEnabled(false)
    setBackGame(null)
    setBackCoverPath(null)
    setDecor({})
    setMsg('Cleared.')
    setClearing(false)
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (!game) return setMsg('Pick a game first.')
    if (!coverPath) return setMsg('Upload the game cover first.')
    if (backEnabled) {
      if (!backGame) return setMsg('Back Cover is on — pick its game first.')
      if (!backCoverPath)
        return setMsg('Back Cover is on — upload the back cover image first.')
      // A shared answer would hand the hard round to anyone who solved the
      // front one, which defeats the whole point of the mode.
      if (backGame.id === game.id)
        return setMsg(
          'Back Cover must be a different game from the front round.',
        )
    }
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
        backcover_enabled: backEnabled,
        // Toggling hard mode off blanks its fields rather than orphaning them,
        // so a disabled day can't leak a half-configured round.
        backcover_path: backEnabled ? backCoverPath : null,
        backcover_game_id: backEnabled ? backGame?.id ?? null : null,
        backcover_game_name: backEnabled ? backGame?.name ?? null : null,
        backcover_game_year: backEnabled ? backGame?.year ?? null : null,
        backcover_game_genre: backEnabled ? backGame?.genre ?? null : null,
        ...decorToRow(decor),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'puzzle_date' },
    )
    setSaving(false)
    setMsg(error ? `Save failed: ${error.message}` : 'Saved.')
  }

  const sb = getSupabase()
  const publicUrl = (p: string | null) =>
    p && sb ? sb.storage.from('covers').getPublicUrl(p).data.publicUrl : null
  const coverUrl = publicUrl(coverPath)
  const backCoverUrl = publicUrl(backCoverPath)
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
                onUpload={(f) => uploadCover(f, 'front')}
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

          <NeoCard tone="paper" shadow="md" className="p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={backEnabled}
                onChange={(e) => setBackEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-black"
              />
              <span>
                <span className="font-display text-[10px] uppercase tracking-wider font-bold flex items-center gap-2">
                  Back Cover — hard mode
                  <span className="border-neo-2 bg-emphasis text-paper-static px-1.5 py-0.5 text-[9px]">
                    Hard
                  </span>
                </span>
                <span className="block text-[11px] text-ink-soft mt-1">
                  Adds an optional second round on this day only. Players are
                  offered it once the normal round is solved or failed. Same 5
                  guesses and the same blur curve, but the image is a{' '}
                  <strong>back</strong> cover and the answer must be a{' '}
                  <strong>different game</strong>.
                </span>
              </span>
            </label>

            {backEnabled && (
              <div className="mt-5 flex flex-col gap-4 border-t-[3px] border-stroke pt-5">
                <GamePicker value={backGame} onChange={setBackGame} />
                {backGame && game && backGame.id === game.id && (
                  <div className="border-neo-2 bg-coral text-ink-static px-3 py-2 text-[11px]">
                    ⚠ This is the same game as the front round — pick a
                    different one or the hard round is a free win.
                  </div>
                )}
                <div>
                  <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
                    Back cover image
                  </div>
                  <div className="text-[11px] text-ink-soft mb-3">
                    Portrait 3:4 — min 600 × 900 px. Blurs on the same
                    5-step curve as the front cover.
                  </div>
                  <div className="w-48">
                    <CoverSlot
                      url={backCoverUrl}
                      onUpload={(f) => uploadCover(f, 'back')}
                      onClear={() => setBackCoverPath(null)}
                    />
                  </div>
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
