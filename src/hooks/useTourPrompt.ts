import { useEffect, useState } from 'react'

const KEY = 'dailies/tour-prompt'
const EVENT = 'dailies:tour-prompt'

// Whether the once-a-day "want to play The Tour?" prompt is allowed to appear.
// Defaults ON. The prompt's "Hide this popup" button flips it OFF; re-enabling
// it in Settings lets the prompt ask again the next day (or on refresh if no
// daily has been played yet).
function readInitial(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

export function useTourPrompt() {
  const [enabled, setEnabledState] = useState<boolean>(readInitial)

  useEffect(() => {
    function onChange(e: Event) {
      setEnabledState((e as CustomEvent<boolean>).detail)
    }
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])

  function setEnabled(next: boolean) {
    setEnabledState(next)
    try {
      localStorage.setItem(KEY, next ? 'true' : 'false')
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  }

  return {
    enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled),
  }
}
