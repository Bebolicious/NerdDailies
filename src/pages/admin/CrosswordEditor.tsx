import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { TagPill } from '../../components/ui/TagPill'
import { SubmitterField } from '../../components/ui/SubmitterField'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { weekStartISO } from '../../lib/dates'
import { computeLayout } from '../../lib/crossword'
import type { WordSlot } from '../../lib/crossword'
import {
  CROSSWORD_MAX_SIZE,
  CROSSWORD_MIN_SIZE,
  CROSSWORD_MIN_WORD_LENGTH,
} from '../../lib/types'
import type { CrosswordClue } from '../../lib/types'
import { cn } from '../../lib/cn'

const SIZE_KEY = (size: number) => `size-${size}`
const CLUE_KEY = (dir: 'across' | 'down', n: number) => `${dir}-${n}`

export function CrosswordEditor() {
  const { date } = useParams<{ date: string }>()
  const week = date ? weekStartISO(date) : null
  const [size, setSize] = useState<number>(5)
  // letters[] is a flat row-major array — '' means "block on save".
  const [letters, setLetters] = useState<string[]>(() => new Array(25).fill(''))
  // Stash keyed by direction-number so re-shuffling the grid doesn't lose the
  // text the admin already typed. Stash persists across size changes too.
  const [clueStash, setClueStash] = useState<Record<string, string>>({})
  const [submitter, setSubmitter] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // ── Load existing ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      if (!sb || !week) {
        setLoading(false)
        return
      }
      const { data } = await sb
        .from('crossword_puzzles')
        .select('*')
        .eq('puzzle_week', week)
        .maybeSingle()
      if (cancelled) return
      if (data) {
        const sz = data.size as number
        setSize(sz)
        setLetters(
          (data.solution as (string | null)[]).map((s) => s ?? ''),
        )
        const stash: Record<string, string> = {}
        for (const c of (data.clues_across as CrosswordClue[]) ?? []) {
          stash[CLUE_KEY('across', c.number)] = c.text
        }
        for (const c of (data.clues_down as CrosswordClue[]) ?? []) {
          stash[CLUE_KEY('down', c.number)] = c.text
        }
        setClueStash(stash)
        setSubmitter((data.submitter as string | null) ?? '')
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [week])

  // Resize grid when size changes. Preserve top-left letters where possible.
  function resizeTo(next: number) {
    if (
      letters.some((l) => l !== '') &&
      !window.confirm(
        `Resize to ${next}x${next}? Letters outside the new grid will be lost.`,
      )
    ) {
      return
    }
    const out: string[] = new Array(next * next).fill('')
    const overlap = Math.min(size, next)
    for (let r = 0; r < overlap; r++) {
      for (let c = 0; c < overlap; c++) {
        out[r * next + c] = letters[r * size + c] ?? ''
      }
    }
    setLetters(out)
    setSize(next)
  }

  // ── Derived layout / slots ───────────────────────────────────────────────
  const solution = useMemo<(string | null)[]>(
    () => letters.map((l) => (l === '' ? null : l.toUpperCase())),
    [letters],
  )
  const layout = useMemo(() => computeLayout(solution, size), [solution, size])

  function clueText(slot: WordSlot): string {
    return clueStash[CLUE_KEY(slot.direction, slot.number)] ?? ''
  }
  function setClueText(slot: WordSlot, text: string) {
    setClueStash((s) => ({ ...s, [CLUE_KEY(slot.direction, slot.number)]: text }))
  }

  // ── Validation ───────────────────────────────────────────────────────────
  const tooShort: WordSlot[] = useMemo(() => {
    const out: WordSlot[] = []
    for (const s of layout.acrossSlots) if (s.length < CROSSWORD_MIN_WORD_LENGTH) out.push(s)
    for (const s of layout.downSlots) if (s.length < CROSSWORD_MIN_WORD_LENGTH) out.push(s)
    return out
  }, [layout])

  const missingClues: WordSlot[] = useMemo(() => {
    const out: WordSlot[] = []
    for (const s of layout.acrossSlots) if (!clueText(s).trim()) out.push(s)
    for (const s of layout.downSlots) if (!clueText(s).trim()) out.push(s)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, clueStash])

  const hasAnyLetter = letters.some((l) => l !== '')
  const noWordsAtAll =
    layout.acrossSlots.length === 0 && layout.downSlots.length === 0

  const blockingErrors: string[] = []
  if (!hasAnyLetter) blockingErrors.push('Grid is empty — add some letters.')
  if (noWordsAtAll && hasAnyLetter)
    blockingErrors.push('No words detected. Letters must connect into rows or columns.')
  if (tooShort.length > 0)
    blockingErrors.push(
      `${tooShort.length} word(s) are shorter than ${CROSSWORD_MIN_WORD_LENGTH} letters.`,
    )
  if (missingClues.length > 0)
    blockingErrors.push(`${missingClues.length} clue(s) missing.`)

  // ── Save / clear ─────────────────────────────────────────────────────────

  async function clearPuzzle() {
    const sb = getSupabase()
    if (!sb || !week) return
    if (
      !window.confirm(
        `Delete the crossword puzzle for week of ${week}? This cannot be undone.`,
      )
    )
      return
    setClearing(true)
    setMsg(null)
    const { error } = await sb
      .from('crossword_puzzles')
      .delete()
      .eq('puzzle_week', week)
    if (error) {
      setMsg(`Could not delete puzzle row: ${error.message}`)
      setClearing(false)
      return
    }
    setSize(5)
    setLetters(new Array(25).fill(''))
    setClueStash({})
    setSubmitter('')
    setMsg('Cleared.')
    setClearing(false)
  }

  async function save() {
    const sb = getSupabase()
    if (!sb || !week) return
    if (blockingErrors.length > 0) {
      setMsg(blockingErrors[0])
      return
    }
    setSaving(true)
    setMsg(null)
    const cluesAcross: CrosswordClue[] = layout.acrossSlots.map((s) => ({
      number: s.number,
      text: clueText(s).trim(),
    }))
    const cluesDown: CrosswordClue[] = layout.downSlots.map((s) => ({
      number: s.number,
      text: clueText(s).trim(),
    }))
    const { error } = await sb.from('crossword_puzzles').upsert(
      {
        puzzle_week: week,
        size,
        solution,
        clues_across: cluesAcross,
        clues_down: cluesDown,
        submitter: submitter.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'puzzle_week' },
    )
    setSaving(false)
    setMsg(error ? `Save failed: ${error.message}` : 'Saved.')
  }

  // ── Grid input refs for auto-advance ─────────────────────────────────────
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  function focusCell(i: number) {
    inputRefs.current[i]?.focus()
    inputRefs.current[i]?.select()
  }
  function onCellChange(i: number, raw: string) {
    // Distinguish "user deleted the cell" (empty raw) from "user typed a
    // non-letter character" (raw has chars but no letters). The first should
    // clear; the second should be ignored so digits/punctuation don't wipe
    // existing letters.
    let letter: string
    if (raw === '') {
      letter = ''
    } else {
      const lettersOnly = raw.replace(/[^a-zA-Z]/g, '')
      if (!lettersOnly) return
      letter = lettersOnly.slice(-1).toUpperCase()
    }
    const next = letters.slice()
    next[i] = letter
    setLetters(next)
    if (letter && i + 1 < next.length) focusCell(i + 1)
  }
  function onCellKeyDown(
    i: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === 'Backspace' && !letters[i] && i > 0) {
      e.preventDefault()
      const next = letters.slice()
      next[i - 1] = ''
      setLetters(next)
      focusCell(i - 1)
      return
    }
    if (e.key === 'ArrowRight' && i + 1 < size * size) {
      e.preventDefault()
      focusCell(i + 1)
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault()
      focusCell(i - 1)
    } else if (e.key === 'ArrowDown' && i + size < size * size) {
      e.preventDefault()
      focusCell(i + size)
    } else if (e.key === 'ArrowUp' && i - size >= 0) {
      e.preventDefault()
      focusCell(i - size)
    } else if (e.key === ' ') {
      // Space converts to block (clears the letter).
      e.preventDefault()
      const next = letters.slice()
      next[i] = ''
      setLetters(next)
    }
  }

  return (
    <AdminLayout
      title={`Crossword · week of ${week}`}
      subtitle={
        date
          ? `URL date ${date} → snapped to Monday ${week}. Editing is per-week.`
          : ''
      }
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
          <NeoCard tone="paper" shadow="md" className="p-5">
            <SubmitterField
              value={submitter}
              onChange={setSubmitter}
              gameType="crossword"
            />
          </NeoCard>

          {/* Size picker */}
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2">
              Grid size
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {Array.from(
                { length: CROSSWORD_MAX_SIZE - CROSSWORD_MIN_SIZE + 1 },
                (_, i) => CROSSWORD_MIN_SIZE + i,
              ).map((n) => (
                <button
                  key={SIZE_KEY(n)}
                  type="button"
                  onClick={() => resizeTo(n)}
                  className={cn(
                    'border-neo-2 px-3 py-1 font-display text-xs uppercase tracking-wider font-bold',
                    n === size
                      ? 'bg-mustard text-ink-static'
                      : 'bg-cream-soft hover:bg-paper',
                  )}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
          </NeoCard>

          {/* Grid editor */}
          <NeoCard tone="paper" shadow="md" className="p-5">
            <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2">
              Letters — empty cells become blocks
            </div>
            <div
              className="grid mx-auto"
              style={{
                gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
                maxWidth: `min(100%, ${size * 60}px)`,
              }}
            >
              {letters.map((v, i) => {
                const number = layout.numbers[i]
                return (
                  <div key={i} className="relative">
                    <input
                      ref={(el) => {
                        inputRefs.current[i] = el
                      }}
                      value={v}
                      onChange={(e) => onCellChange(i, e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(i, e)}
                      maxLength={1}
                      className={cn(
                        'aspect-square w-full border-neo-2 text-center font-display font-bold text-xl uppercase outline-none focus:bg-mustard',
                        v ? 'bg-paper' : 'bg-emphasis/15',
                      )}
                    />
                    {number !== null && (
                      <span className="absolute top-0 left-0.5 text-[9px] font-display font-bold text-ink-soft leading-none pointer-events-none">
                        {number}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="text-xs text-ink-soft mt-3">
              Type a letter to fill a square; press Space or Backspace to clear
              it. Numbers update live based on which cells start an across or
              down word.
            </div>
          </NeoCard>

          {/* Clue editors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ClueEditor
              title="Across"
              slots={layout.acrossSlots}
              valueFor={clueText}
              onChange={setClueText}
            />
            <ClueEditor
              title="Down"
              slots={layout.downSlots}
              valueFor={clueText}
              onChange={setClueText}
            />
          </div>

          {/* Validation summary */}
          {blockingErrors.length > 0 ? (
            <NeoCard tone="coral" shadow="sm" className="p-3 text-sm">
              <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-1">
                Needs attention
              </div>
              <ul className="list-disc list-inside text-xs">
                {blockingErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </NeoCard>
          ) : (
            <NeoCard tone="lime" shadow="sm" className="p-3 text-sm">
              <TagPill tone="ink">Ready</TagPill>{' '}
              <span className="ml-2">
                {layout.acrossSlots.length} across · {layout.downSlots.length}{' '}
                down
              </span>
            </NeoCard>
          )}

          {msg && (
            <NeoCard tone="mustard" shadow="sm" className="p-3 text-sm">
              {msg}
            </NeoCard>
          )}

          <div className="flex gap-3 justify-end flex-wrap">
            <NeoButton tone="coral" onClick={clearPuzzle} disabled={saving || clearing}>
              {clearing ? 'Clearing…' : 'Clear puzzle'}
            </NeoButton>
            <NeoButton
              tone="lime"
              onClick={save}
              disabled={saving || clearing || blockingErrors.length > 0}
            >
              {saving ? 'Saving…' : 'Save puzzle'}
            </NeoButton>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function ClueEditor({
  title,
  slots,
  valueFor,
  onChange,
}: {
  title: string
  slots: WordSlot[]
  valueFor: (s: WordSlot) => string
  onChange: (s: WordSlot, text: string) => void
}) {
  return (
    <NeoCard tone="paper" shadow="md" className="p-5">
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-3">
        {title} ({slots.length})
      </div>
      <div className="flex flex-col gap-2">
        {slots.length === 0 && (
          <div className="text-xs text-ink-soft italic">
            No {title.toLowerCase()} words yet.
          </div>
        )}
        {slots.map((s) => (
          <div key={`${s.direction}-${s.number}`} className="flex items-start gap-2">
            <span
              className={cn(
                'border-neo-2 bg-mustard text-ink-static px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold shrink-0',
              )}
            >
              {s.number} · {s.length}
            </span>
            <input
              value={valueFor(s)}
              onChange={(e) => onChange(s, e.target.value)}
              placeholder={`Clue for ${s.number} ${title.toLowerCase()} (${s.length} letters)`}
              className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold flex-1 outline-none focus:bg-paper"
            />
          </div>
        ))}
      </div>
    </NeoCard>
  )
}
