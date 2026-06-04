import { useLocation } from 'react-router-dom'
import { clearDateOverride, getDateOverride } from '../../lib/dates'

export function DevDateBanner() {
  // Recompute on every navigation so the banner disappears immediately when
  // the override is cleared (e.g. clicking the Dailies logo).
  useLocation()
  const override = getDateOverride()

  if (!override) return null

  const label = import.meta.env.DEV ? 'Dev date override' : 'Replay'

  return (
    <div className="fixed bottom-4 left-4 z-50 border-neo bg-mustard text-ink-static shadow-neo px-3 py-2 flex items-center gap-3">
      <span className="font-display text-[10px] uppercase tracking-wider font-bold">
        {label}
      </span>
      <span className="font-display text-sm font-bold">{override}</span>
      <button
        onClick={() => {
          clearDateOverride()
          window.location.href = window.location.pathname
        }}
        className="border-neo-2 bg-paper text-ink px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold hover:bg-coral hover:text-ink-static"
      >
        Back to today
      </button>
    </div>
  )
}
