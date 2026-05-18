import { useEffect, useState } from 'react'
import { clearDateOverride, getDateOverride } from '../../lib/dates'

export function DevDateBanner() {
  const [override, setOverride] = useState<string | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    setOverride(getDateOverride())
    const refresh = () => setOverride(getDateOverride())
    window.addEventListener('popstate', refresh)
    return () => window.removeEventListener('popstate', refresh)
  }, [])

  if (!import.meta.env.DEV || !override) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 border-neo bg-mustard text-ink-static shadow-neo px-3 py-2 flex items-center gap-3">
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        Dev date override
      </span>
      <span className="font-display text-sm font-bold">{override}</span>
      <button
        onClick={() => {
          clearDateOverride()
          window.location.href = window.location.pathname
        }}
        className="border-neo-2 bg-paper text-ink px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold hover:bg-coral hover:text-ink-static"
      >
        Clear
      </button>
    </div>
  )
}
