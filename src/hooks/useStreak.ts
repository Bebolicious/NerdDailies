import { useEffect, useState } from 'react'
import { currentStreak } from '../lib/scoreStore'
import { todayISO } from '../lib/dates'

export function useStreak() {
  const [streak, setStreak] = useState(0)
  useEffect(() => {
    setStreak(currentStreak(todayISO()))
    const onStorage = () => setStreak(currentStreak(todayISO()))
    window.addEventListener('storage', onStorage)
    window.addEventListener('dailies:result-saved', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('dailies:result-saved', onStorage)
    }
  }, [])
  return streak
}
