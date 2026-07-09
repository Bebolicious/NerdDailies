import { useEffect, useState } from 'react'

const KEY = 'dailies/screen-effects'

// Global toggle for the page-wide celebration effects (vignette + emoji
// particles rendered by ScreenEffects). Defaults ON. Turning it off disables
// the animations only — custom/submitter banners still appear.
function readInitial(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

export function useScreenEffects() {
  const [enabled, setEnabled] = useState<boolean>(readInitial)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, enabled ? 'true' : 'false')
    } catch {
      /* ignore */
    }
    // Broadcast so any mounted ScreenEffects instance updates live (they read
    // their own hook instance, but the modal lives in a different subtree).
    window.dispatchEvent(new CustomEvent('dailies:screen-effects', { detail: enabled }))
  }, [enabled])

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<boolean>).detail
      setEnabled(detail)
    }
    window.addEventListener('dailies:screen-effects', onChange)
    return () => window.removeEventListener('dailies:screen-effects', onChange)
  }, [])

  return {
    enabled,
    toggle: () => setEnabled((v) => !v),
    setEnabled,
  }
}
