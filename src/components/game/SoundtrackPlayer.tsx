import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Music } from 'lucide-react'
import { NeoCard } from '../ui/NeoCard'
import { NeoButton } from '../ui/NeoButton'
import { TagPill } from '../ui/TagPill'
import { SOUNDTRACK_UNLOCK_SECONDS } from '../../lib/types'
import { cn } from '../../lib/cn'

type Props = {
  audioUrl: string
  revealStart: number
  unlockStep: number // 0..5, index into SOUNDTRACK_UNLOCK_SECONDS
  trackTitle?: string
  finished: boolean
}

export function SoundtrackPlayer({
  audioUrl,
  revealStart,
  unlockStep,
  trackTitle = 'Main Theme',
  finished,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)

  // Determine playable window length. ALL on the final step (or when finished).
  const stepValue =
    SOUNDTRACK_UNLOCK_SECONDS[Math.min(unlockStep, SOUNDTRACK_UNLOCK_SECONDS.length - 1)]
  const windowSeconds =
    finished || stepValue === 'ALL'
      ? Math.max(duration - revealStart, 0)
      : (stepValue as number)
  const windowEnd = revealStart + windowSeconds

  // Stop playback when the position passes the window end.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setPosition(audio.currentTime)
      if (audio.currentTime >= windowEnd && !finished && stepValue !== 'ALL') {
        audio.pause()
        audio.currentTime = revealStart
        setPlaying(false)
      }
    }
    const onLoaded = () => setDuration(audio.duration || 0)
    const onEnded = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
    }
  }, [windowEnd, finished, stepValue, revealStart])

  function toggle() {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      if (audio.currentTime < revealStart || audio.currentTime >= windowEnd) {
        audio.currentTime = revealStart
      }
      audio.play()
      setPlaying(true)
    }
  }

  const playableLabel =
    windowSeconds >= 60
      ? `${Math.floor(windowSeconds / 60)}:${String(Math.floor(windowSeconds % 60)).padStart(2, '0')}`
      : `${windowSeconds.toFixed(windowSeconds < 1 ? 2 : 0)}s`

  const positionLabel = formatSeconds(Math.max(0, position - revealStart))

  return (
    <NeoCard tone="ink" shadow="md" className="p-5">
      <audio ref={audioRef} src={audioUrl || undefined} preload="auto" />
      <div className="flex items-center gap-4">
        <NeoCard tone="mustard" shadow="sm" className="w-14 h-14 flex items-center justify-center shrink-0">
          <Music className="h-7 w-7 stroke-[2.5]" />
        </NeoCard>
        <div className="flex-1">
          <div className="font-display text-[10px] uppercase tracking-[0.2em] text-lime mb-1">
            Now playing · {positionLabel} / {playableLabel}
          </div>
          <div className="font-display text-xl font-bold leading-tight">
            Track 03 — “{trackTitle}”
          </div>
        </div>
        <TagPill tone="mustard">
          {finished ? 'Full track' : `${unlockStep + 1} of 6 unlocked`}
        </TagPill>
      </div>

      <Waveform
        progress={duration > 0 ? Math.min(1, windowSeconds / Math.max(duration - revealStart, 0.001)) : 0}
        playhead={duration > 0 ? Math.min(1, Math.max(0, (position - revealStart) / Math.max(duration - revealStart, 0.001))) : 0}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <div className="flex gap-2">
          <NeoButton
            tone="lime"
            size="md"
            onClick={toggle}
            disabled={!audioUrl}
          >
            {playing ? (
              <>
                <Pause className="inline h-4 w-4 mr-1" /> Pause {playableLabel}
              </>
            ) : (
              <>
                <Play className="inline h-4 w-4 mr-1" /> Play {playableLabel}
              </>
            )}
          </NeoButton>
        </div>
        <div className="flex gap-1.5">
          {SOUNDTRACK_UNLOCK_SECONDS.map((v, i) => (
            <span
              key={i}
              className={cn(
                'border-neo-2 px-2 py-1 font-display text-[10px] uppercase tracking-wider font-bold',
                i <= unlockStep || finished
                  ? 'bg-lime text-ink-static'
                  : 'bg-ink-soft text-paper opacity-60',
              )}
            >
              {v === 'ALL' ? 'ALL' : `${v}s`}
            </span>
          ))}
        </div>
      </div>

      {!audioUrl && (
        <div className="mt-4 text-xs opacity-70 font-display uppercase tracking-wider">
          No audio uploaded for this puzzle yet — admin can attach one in the dashboard.
        </div>
      )}
    </NeoCard>
  )
}

function Waveform({ progress, playhead }: { progress: number; playhead: number }) {
  // Deterministic pseudo-random bar heights so the waveform looks consistent.
  const bars = Array.from({ length: 56 }).map((_, i) => {
    const seed = Math.sin(i * 12.9898) * 43758.5453
    const frac = seed - Math.floor(seed)
    return 0.25 + frac * 0.75
  })
  return (
    <div className="mt-4 bg-ink-soft border-neo-2 h-28 px-3 flex items-center justify-between gap-[2px] relative overflow-hidden">
      {bars.map((h, i) => {
        const pos = (i + 0.5) / bars.length
        const within = pos <= progress
        const isPlayhead = pos <= playhead
        return (
          <div
            key={i}
            className={cn(
              'w-[3px]',
              within ? (isPlayhead ? 'bg-lime' : 'bg-lime/40') : 'bg-paper/15',
            )}
            style={{ height: `${h * 100}%` }}
          />
        )
      })}
    </div>
  )
}

function formatSeconds(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}
