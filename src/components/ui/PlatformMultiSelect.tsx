import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { DB_PLATFORMS } from '../../lib/platforms'
import { cn } from '../../lib/cn'

// Multi-select for trophy platforms. Replaces the old free-text input — pick
// any number of consoles/platforms from the set present in public.games.
// Stored upstream as a comma-separated string in trophy_puzzles.platform.
export function PlatformMultiSelect({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click so the dropdown doesn't linger over the form.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DB_PLATFORMS
    return DB_PLATFORMS.filter((p) => p.toLowerCase().includes(q))
  }, [query])

  function toggle(p: string) {
    if (value.includes(p)) onChange(value.filter((x) => x !== p))
    else onChange([...value, p])
  }

  return (
    <div className="flex flex-col gap-2" ref={ref}>
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        Platforms
      </span>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <span
              key={p}
              className="border-neo-2 bg-lime text-ink-static pl-2 pr-1 py-1 flex items-center gap-1 font-display text-[10px] uppercase tracking-wider font-bold"
            >
              {p}
              <button
                type="button"
                onClick={() => toggle(p)}
                className="border-neo-2 bg-paper p-0.5"
                aria-label={`Remove ${p}`}
              >
                <X className="h-2.5 w-2.5 stroke-[3]" />
              </button>
            </span>
          ))}
        </div>
      )}

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
            placeholder="Add platforms…"
            className="flex-1 bg-transparent outline-none text-sm font-bold"
          />
        </div>
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 border-neo bg-paper shadow-neo max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-ink-soft font-bold">
                No match.
              </div>
            ) : (
              filtered.map((p) => {
                const selected = value.includes(p)
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => toggle(p)}
                    className={cn(
                      'w-full text-left px-3 py-2 border-b-2 border-divider last:border-b-0 flex items-center justify-between gap-2 hover:bg-lime hover:text-ink-static',
                      selected && 'bg-lime text-ink-static',
                    )}
                  >
                    <span className="font-display text-xs uppercase tracking-wider font-bold">
                      {p}
                    </span>
                    {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
