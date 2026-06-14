import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { searchGames } from '../../lib/gamedb'
import type { Game } from '../../lib/types'
import { cn } from '../../lib/cn'

// Single-select game picker for admin editors. Distinct from the player-facing
// GameSearch (no commit button — picking a row sets the answer immediately).
export function GamePicker({
  value,
  onChange,
  label = 'Answer game',
}: {
  value: Game | null
  onChange: (g: Game | null) => void
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Game[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!query.trim()) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      searchGames(query).then((r) => {
        if (!cancelled) setResults(r)
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  return (
    <div className="flex flex-col gap-2">
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        {label}
      </span>
      {value ? (
        <div className="border-neo bg-lime text-ink-static px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-display text-sm uppercase tracking-wider font-bold">
              {value.name}
            </div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">
              {value.year ?? '—'} · {value.genre ?? '—'}
            </div>
          </div>
          <button
            onClick={() => {
              onChange(null)
              setQuery('')
            }}
            className="border-neo-2 bg-paper p-1.5"
            aria-label="Clear selection"
          >
            <X className="h-3 w-3 stroke-[3]" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="border-neo bg-paper flex items-center gap-3 px-3 py-2">
            <Search className="h-3.5 w-3.5 stroke-[3]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search games…"
              className="flex-1 bg-transparent outline-none text-sm font-bold"
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 border-neo bg-paper shadow-neo max-h-72 overflow-y-auto">
              {results.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    onChange(g)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b-2 border-divider last:border-b-0 flex items-center justify-between gap-2 hover:bg-lime hover:text-ink-static',
                  )}
                >
                  <span className="font-display text-xs uppercase tracking-wider font-bold">
                    {g.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-soft">
                    {g.year ?? '—'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
