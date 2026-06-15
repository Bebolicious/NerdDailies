import { useEffect, useState } from 'react'

const KEY = 'dailies/readable'

function readInitial(): boolean {
  if (typeof window === 'undefined') return true
  // Default to readable ON. The boot script in index.html sets the attribute
  // unless the user has explicitly opted out via localStorage.
  return document.documentElement.getAttribute('data-readable') === 'true'
}

export function useReadability() {
  const [readable, setReadable] = useState<boolean>(readInitial)

  useEffect(() => {
    if (readable) {
      document.documentElement.setAttribute('data-readable', 'true')
    } else {
      document.documentElement.removeAttribute('data-readable')
    }
    try {
      localStorage.setItem(KEY, readable ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }, [readable])

  return {
    readable,
    toggle: () => setReadable((r) => !r),
    setReadable,
  }
}
