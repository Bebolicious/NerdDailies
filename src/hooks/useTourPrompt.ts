import { useEffect, useState } from 'react'

const KEY = 'dailies/tour-prompt'
const EVENT = 'dailies:tour-prompt'

// Whether the once-a-day "want to play The Tour?" prompt is allowed to appear.
//
// Defaults OFF — an unset key means "no", so nobody is interrupted by the
// popup until they opt in from Settings. (It used to default ON, which meant
// every visitor got the modal on their first visit of the day.) Enabling it in
// Settings lets the prompt ask the next day, or on refresh if no daily has been
// played yet; the prompt's own "Hide this popup" button flips it back off.
//
// Note this reads as an explicit opt-in, so only the literal string 'true'
// counts — an absent key and a stored 'false' both mean off.
function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
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
