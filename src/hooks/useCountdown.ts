import { useEffect, useState } from 'react'
import { formatHMS, msUntilNextLocalMidnight } from '../lib/dates'

export function useCountdownToMidnight() {
  const [label, setLabel] = useState(() => formatHMS(msUntilNextLocalMidnight()))
  useEffect(() => {
    const tick = () => setLabel(formatHMS(msUntilNextLocalMidnight()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return label
}
