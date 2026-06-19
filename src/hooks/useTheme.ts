import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'dailies/theme'

// Has the user made an explicit light/dark choice (the settings toggle)?
// When they have, that choice persists and wins over the OS preference.
function hasOverride(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light'
  } catch {
    return false
  }
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light'
  // The pre-mount bootstrap in index.html already resolved this (stored
  // override, else OS preference) onto the <html> element.
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  return systemTheme()
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readInitial)
  const [override, setOverride] = useState<boolean>(hasOverride)

  // Reflect the current theme onto <html> whenever it changes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // While there's no explicit choice, follow the OS preference and keep
  // following it live if the user flips their system theme.
  useEffect(() => {
    if (override || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setThemeState(mq.matches ? 'dark' : 'light')
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [override])

  // An explicit choice persists and stops following the OS.
  const setTheme = (t: Theme) => {
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* ignore */
    }
    setOverride(true)
    setThemeState(t)
  }

  return {
    theme,
    toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    setTheme,
  }
}
