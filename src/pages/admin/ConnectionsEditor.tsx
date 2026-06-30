import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { TagPill } from '../../components/ui/TagPill'
import { SubmitterField } from '../../components/ui/SubmitterField'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { formatLong } from '../../lib/dates'
import {
  CONNECTIONS_DIFFICULTIES,
  CONNECTIONS_GROUP_SIZE,
  type ConnectionsGroup,
} from '../../lib/types'
import { cn } from '../../lib/cn'

type GroupForm = {
  category: string
  words: string[] // length CONNECTIONS_GROUP_SIZE
}

function emptyGroups(): GroupForm[] {
  return CONNECTIONS_DIFFICULTIES.map(() => ({
    category: '',
    words: Array.from({ length: CONNECTIONS_GROUP_SIZE }, () => ''),
  }))
}

// Section header tone per difficulty (matches the player band colors).
const SECTION_CLASS: Record<number, string> = {
  0: 'bg-mustard text-ink-static',
  1: 'bg-lime text-ink-static',
  2: 'bg-blue text-paper-static',
  3: 'bg-coral text-ink-static',
}

export function ConnectionsEditor() {
  const { date } = useParams<{ date: string }>()

  const [theme, setTheme] = useState('')
  const [submitter, setSubmitter] = useState('')
  const [groups, setGroups] = useState<GroupForm[]>(() => emptyGroups())
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
        .from('connections_puzzles')
        .select('*')
        .eq('puzzle_date', date)
        .maybeSingle()
      if (cancelled) return
      if (data) {
        setTheme(data.theme ?? '')
        setSubmitter((data.submitter as string | null) ?? '')
        const loaded = emptyGroups()
        for (const g of (data.groups as ConnectionsGroup[]) ?? []) {
          const i = g.difficulty
          if (i >= 0 && i < loaded.length) {
            loaded[i] = {
              category: g.category ?? '',
              words: padWords(g.words ?? []),
            }
          }
        }
        setGroups(loaded)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date])

  function patchCategory(i: number, value: string) {
    setGroups((prev) =>
      prev.map((g, idx) => (idx === i ? { ...g, category: value } : g)),
    )
  }
  function patchWord(i: number, j: number, value: string) {
    setGroups((prev) =>
      prev.map((g, idx) =>
        idx === i
          ? { ...g, words: g.words.map((w, k) => (k === j ? value : w)) }
          : g,
      ),
    )
  }

  const validation = useMemo(() => validate(groups), [groups])

  async function save() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (!validation.ok) {
      setMsg(validation.error)
      return
    }
    setSaving(true)
    setMsg(null)

    const cleanGroups: ConnectionsGroup[] = groups.map((g, i) => ({
      difficulty: CONNECTIONS_DIFFICULTIES[i].difficulty,
      category: g.category.trim(),
      words: g.words.map((w) => w.trim()),
    }))
    // Shuffle the 16 words into the fixed display layout — done once here so
    // every player sees the same board for the week.
    const layout = shuffleArray(cleanGroups.flatMap((g) => g.words))

    const { error } = await sb.from('connections_puzzles').upsert(
      {
        puzzle_date: date,
        theme: theme.trim() || null,
        groups: cleanGroups,
        layout,
        submitter: submitter.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'puzzle_date' },
    )
    setSaving(false)
    if (error) return setMsg(`Save failed: ${error.message}`)
    setMsg('Saved. Board layout was reshuffled.')
  }

  async function clearPuzzle() {
    const sb = getSupabase()
    if (!sb || !date) return
    if (
      !window.confirm(
        `Delete the Connections puzzle for ${date}? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)
    const { error } = await sb
      .from('connections_puzzles')
      .delete()
      .eq('puzzle_date', date)
    setClearing(false)
    if (error) return setMsg(`Could not delete: ${error.message}`)
    setTheme('')
    setSubmitter('')
    setGroups(emptyGroups())
    setMsg('Cleared.')
  }

  return (
    <AdminLayout
      title={`Connections · ${date}`}
      subtitle={`Schedule for ${date && formatLong(date)}.`}
    >
      {!isSupabaseConfigured() && (
        <NeoCard tone="coral" shadow="sm" className="p-3 mb-4 text-sm">
          ⚠ Supabase not configured — saves will fail.
        </NeoCard>
      )}
      {loading ? (
        <div className="text-sm text-ink-soft">Loading…</div>
      ) : (
        <div className="flex flex-col gap-5">
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <TagPill tone="orange">Daily · 4 groups of 4</TagPill>
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
                {validation.filledGroups} / {CONNECTIONS_DIFFICULTIES.length}{' '}
                groups complete
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-wider font-bold">
                Weekly theme (optional)
              </span>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. Boss fights & broken controllers"
                className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
              />
            </label>
            <div className="mt-4">
              <SubmitterField
                value={submitter}
                onChange={setSubmitter}
                gameType="connections"
              />
            </div>
            <p className="text-[11px] text-ink-soft mt-4 leading-snug">
              Each section is a hidden difficulty (Yellow easiest → Red
              hardest). Fill a category name and four words per section. Words
              must be unique across the whole puzzle. On save the 16 words are
              shuffled into the board everyone sees.
            </p>
          </NeoCard>

          {groups.map((g, i) => {
            const cfg = CONNECTIONS_DIFFICULTIES[i]
            const complete = groupComplete(g)
            return (
              <NeoCard key={i} tone="paper" shadow="md" className="p-0 overflow-hidden">
                <div
                  className={cn(
                    'px-4 py-2.5 border-b-[3px] border-stroke flex items-center justify-between gap-3 flex-wrap',
                    SECTION_CLASS[i],
                  )}
                >
                  <div className="font-display text-sm uppercase tracking-wider font-bold flex items-center gap-2">
                    {cfg.label}
                    <span className="text-[10px] font-bold opacity-80 normal-case tracking-normal">
                      {cfg.hint}
                    </span>
                  </div>
                  <div className="font-display text-[10px] uppercase tracking-wider border-[2px] border-stroke px-1.5 py-0.5">
                    {complete ? '✓ complete' : 'incomplete'}
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="font-display text-[10px] uppercase tracking-wider font-bold">
                      Category (revealed when solved)
                    </span>
                    <input
                      value={g.category}
                      onChange={(e) => patchCategory(i, e.target.value)}
                      placeholder="e.g. FromSoftware games"
                      className="border-neo-2 bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {g.words.map((w, j) => (
                      <input
                        key={j}
                        value={w}
                        onChange={(e) => patchWord(i, j, e.target.value)}
                        placeholder={`Word ${j + 1}`}
                        className="border-neo-2 bg-paper px-2 py-1.5 text-sm font-bold outline-none focus:bg-cream-soft"
                      />
                    ))}
                  </div>
                </div>
              </NeoCard>
            )
          })}

          {msg && (
            <NeoCard tone="mustard" shadow="sm" className="p-3 text-sm">
              {msg}
            </NeoCard>
          )}

          <div className="flex gap-3 justify-end flex-wrap sticky bottom-3 bg-cream/90 backdrop-blur border-neo-2 p-3">
            <NeoButton tone="coral" onClick={clearPuzzle} disabled={saving || clearing}>
              {clearing ? 'Clearing…' : 'Clear puzzle'}
            </NeoButton>
            <NeoButton
              tone="lime"
              onClick={save}
              disabled={saving || clearing || !validation.ok}
            >
              {saving ? 'Saving…' : 'Save puzzle'}
            </NeoButton>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// ─── validation helpers ──────────────────────────────────────────────────────

function padWords(words: string[]): string[] {
  const out = words.slice(0, CONNECTIONS_GROUP_SIZE)
  while (out.length < CONNECTIONS_GROUP_SIZE) out.push('')
  return out
}

function groupComplete(g: GroupForm): boolean {
  return (
    g.category.trim() !== '' &&
    g.words.every((w) => w.trim() !== '')
  )
}

function validate(groups: GroupForm[]): {
  ok: boolean
  error: string
  filledGroups: number
} {
  const filledGroups = groups.filter(groupComplete).length
  for (const g of groups) {
    if (!groupComplete(g)) {
      return {
        ok: false,
        error: 'Fill in all four sections: a category and four words each.',
        filledGroups,
      }
    }
  }
  const all = groups.flatMap((g) => g.words.map((w) => w.trim().toLowerCase()))
  const seen = new Set<string>()
  for (const w of all) {
    if (seen.has(w)) {
      return {
        ok: false,
        error: `Duplicate word "${w}" — every word must be unique across the puzzle.`,
        filledGroups,
      }
    }
    seen.add(w)
  }
  return { ok: true, error: '', filledGroups }
}

function shuffleArray<T>(input: T[]): T[] {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
