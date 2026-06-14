import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { SubmitterField } from '../../components/ui/SubmitterField'
import { GamePicker } from '../../components/game/GamePicker'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import type { Game } from '../../lib/types'
import { formatLong } from '../../lib/dates'

export function TrophyEditor() {
  const { date } = useParams<{ date: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [trophyName, setTrophyName] = useState('')
  const [trophyDesc, setTrophyDesc] = useState('')
  const [clues, setClues] = useState<string[]>(['', '', '', ''])
  const [rarity, setRarity] = useState('')
  const [platform, setPlatform] = useState('')
  const [gamerscore, setGamerscore] = useState('')
  const [submitter, setSubmitter] = useState('')
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
        .from('trophy_puzzles')
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
        setTrophyName(data.trophy_name ?? '')
        setTrophyDesc(data.trophy_description ?? '')
        const existingClues = (data.clues as string[]) ?? []
        setClues([0, 1, 2, 3].map((i) => existingClues[i] ?? ''))
        setRarity(data.rarity_pct?.toString() ?? '')
        setPlatform(data.platform ?? '')
        setGamerscore(data.gamerscore?.toString() ?? '')
        setSubmitter((data.submitter as string | null) ?? '')
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date])

  async function clearPuzzle() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (
      !window.confirm(
        `Delete the trophy puzzle for ${date}? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)
    const { error } = await sb
      .from('trophy_puzzles')
      .delete()
      .eq('puzzle_date', date)
    if (error) {
      setMsg(`Could not delete puzzle row: ${error.message}`)
      setClearing(false)
      return
    }
    setGame(null)
    setTrophyName('')
    setTrophyDesc('')
    setClues(['', '', '', ''])
    setRarity('')
    setPlatform('')
    setGamerscore('')
    setSubmitter('')
    setMsg('Cleared.')
    setClearing(false)
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (!game) return setMsg('Pick a game first.')
    if (!trophyName.trim() || !trophyDesc.trim())
      return setMsg('Trophy name and description are required.')
    setSaving(true)
    setMsg(null)
    const { error } = await sb.from('trophy_puzzles').upsert(
      {
        puzzle_date: date,
        game_id: game.id,
        game_name: game.name,
        game_year: game.year,
        game_genre: game.genre,
        trophy_name: trophyName.trim(),
        trophy_description: trophyDesc.trim(),
        clues: clues.map((c) => c.trim()).filter(Boolean),
        rarity_pct: rarity ? Number(rarity) : null,
        platform: platform || null,
        gamerscore: gamerscore ? Number(gamerscore) : null,
        submitter: submitter.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'puzzle_date' },
    )
    setSaving(false)
    setMsg(error ? `Save failed: ${error.message}` : 'Saved.')
  }

  return (
    <AdminLayout
      title={`Trophy · ${date}`}
      subtitle={`Schedule for ${date && formatLong(date)}.`}
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
            <SubmitterField
              value={submitter}
              onChange={setSubmitter}
              gameType="trophy"
            />
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5 flex flex-col gap-3">
            <Field label="Trophy name">
              <input
                value={trophyName}
                onChange={(e) => setTrophyName(e.target.value)}
                placeholder='e.g. "I AM ERROR."'
                className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold w-full outline-none focus:bg-paper"
              />
            </Field>
            <Field label="Description (revealed after wrong #1)">
              <textarea
                value={trophyDesc}
                onChange={(e) => setTrophyDesc(e.target.value)}
                rows={2}
                placeholder="Speak to every NPC in the Town Without a Name."
                className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold w-full outline-none focus:bg-paper resize-y"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Rarity %">
                <input
                  type="number"
                  step="0.1"
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold w-full outline-none focus:bg-paper"
                />
              </Field>
              <Field label="Platform">
                <input
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  placeholder="NES"
                  className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold w-full outline-none focus:bg-paper"
                />
              </Field>
              <Field label="Gamerscore">
                <input
                  type="number"
                  value={gamerscore}
                  onChange={(e) => setGamerscore(e.target.value)}
                  className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold w-full outline-none focus:bg-paper"
                />
              </Field>
            </div>
          </NeoCard>

          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2">
              Clues — unlocked at wrong guesses 2–5
            </div>
            <div className="flex flex-col gap-2">
              {clues.map((clue, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="border-neo-2 bg-lime text-ink-static px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold">
                    #{i + 1}
                  </span>
                  <input
                    value={clue}
                    onChange={(e) => {
                      const next = [...clues]
                      next[i] = e.target.value
                      setClues(next)
                    }}
                    placeholder={`Clue ${i + 1}…`}
                    className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold flex-1 outline-none focus:bg-paper"
                  />
                </div>
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

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        {label}
      </span>
      {children}
    </label>
  )
}
