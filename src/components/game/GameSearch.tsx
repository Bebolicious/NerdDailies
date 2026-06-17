import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { searchGames } from '../../lib/gamedb'
import type { Game } from '../../lib/types'
import { NeoButton } from '../ui/NeoButton'
import { cn } from '../../lib/cn'

type Props = {
  placeholder?: string
  disabled?: boolean
  onGuess: (game: Game) => void
  onSkip?: () => void
  /**
   * Which way the autocomplete dropdown opens. Defaults to "up" because the
   * search input is usually anchored to the bottom of the game card. Games
   * that render the search higher up (Trophy, Soundtrack) pass "down" so the
   * dropdown doesn't get clipped against the viewport top.
   */
  direction?: 'up' | 'down'
}

export function GameSearch({
  placeholder = 'Search games…',
  disabled,
  onGuess,
  onSkip,
  direction = 'up',
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Game[]>([])
  const [selected, setSelected] = useState<Game | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    if (!query.trim()) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      searchGames(query).then((r) => {
        if (!cancelled) {
          setResults(r)
          setActiveIndex(0)
        }
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function commit(g: Game) {
    setSelected(g)
    setQuery(g.name)
    setOpen(false)
  }

  function submit() {
    if (selected && !disabled) {
      onGuess(selected)
      setSelected(null)
      setQuery('')
      setResults([])
    }
  }

  // When two results share an identical name (e.g. "God of War" 2005 vs the
  // 2018 reboot), tag the strictly-newer one with a "New" badge so the player
  // can tell them apart now that the release year is no longer shown inline.
  const newerIds = (() => {
    const byName = new Map<string, Game[]>()
    for (const g of results) {
      const key = g.name.trim().toLowerCase()
      const list = byName.get(key)
      if (list) list.push(g)
      else byName.set(key, [g])
    }
    const ids = new Set<Game['id']>()
    for (const list of byName.values()) {
      if (list.length < 2) continue
      const years = list.map((g) => g.year).filter((y): y is number => y != null)
      if (years.length === 0) continue
      const maxYear = Math.max(...years)
      // Only tag if there's an actual older sibling to disambiguate against.
      if (!list.some((g) => g.year != null && g.year < maxYear)) continue
      for (const g of list) {
        if (g.year === maxYear) ids.add(g.id)
      }
    }
    return ids
  })()

  return (
    <div className="flex flex-col md:flex-row md:items-stretch gap-3">
      <div ref={boxRef} className="relative md:flex-1">
        <div
          className={cn(
            'border-neo bg-paper flex items-center gap-3 px-4 py-3 shadow-neo-sm',
            disabled && 'opacity-50',
          )}
        >
          <div className="border-neo-2 bg-cream w-7 h-7 flex items-center justify-center shrink-0">
            <Search className="h-3.5 w-3.5 stroke-[3]" />
          </div>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(null)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open || results.length === 0) {
                if (e.key === 'Enter' && selected) submit()
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const pick = results[activeIndex]
                if (pick) commit(pick)
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            disabled={disabled}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-sm font-bold placeholder:text-ink-soft placeholder:font-medium"
          />
        </div>

        {open && results.length > 0 && (
          <div
            className={cn(
              'absolute left-0 right-0 z-30 border-neo bg-paper shadow-neo max-h-80 overflow-y-auto',
              direction === 'down' ? 'top-full mt-2' : 'bottom-full mb-2',
            )}
          >
            {results.map((g, i) => (
              <button
                key={g.id}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(g)}
                className={cn(
                  'w-full text-left px-4 py-2 border-b-2 border-divider last:border-b-0 flex justify-between items-center gap-3',
                  i === activeIndex && 'bg-lime text-ink-static',
                )}
              >
                <span className="font-display text-xs uppercase tracking-wider font-bold flex items-center gap-2">
                  {g.name}
                  {newerIds.has(g.id) && (
                    <span className="border-neo-2 px-1.5 py-0.5 text-[9px] leading-none font-bold normal-case tracking-normal bg-coral text-ink-static">
                      New
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-wider whitespace-nowrap',
                    i === activeIndex ? 'opacity-70' : 'text-ink-soft',
                  )}
                >
                  {g.genre ?? '—'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <NeoButton
          tone="lime"
          size="md"
          onClick={submit}
          disabled={disabled || !selected}
          className="flex-1 md:flex-none"
        >
          Guess
        </NeoButton>
        {onSkip && (
          <NeoButton
            tone="paper"
            size="md"
            onClick={onSkip}
            disabled={disabled}
            className="flex-1 md:flex-none"
          >
            Skip
          </NeoButton>
        )}
      </div>
    </div>
  )
}
