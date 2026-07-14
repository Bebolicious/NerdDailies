import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useScreenEffects } from '../../hooks/useScreenEffects'
import { parseColors, vignetteBackground } from '../../lib/decor'
import type { ScreenEffectType } from '../../lib/types'

// Full-viewport celebration overlay shown when a round finishes. Position:fixed
// so it covers the screen regardless of where it's mounted in the page tree.
// Combines an optional transparent→color edge vignette with an optional emoji
// particle field (falling / rising / confetti). Honors the global "Screen
// effects" toggle (useScreenEffects) — off ⇒ renders nothing.

type Props = {
  type?: ScreenEffectType
  emoji?: string
  color?: string
  active: boolean
}

const PARTICLE_COUNT = 26

// Fixed random seeds, generated once at module load (never during render, so
// the purity lint rule stays happy). Each particle's on-screen layout is pure
// arithmetic on these seeds, keyed by effect type.
const SEEDS = Array.from({ length: PARTICLE_COUNT }).map(() => ({
  r1: Math.random(),
  r2: Math.random(),
  r3: Math.random(),
  r4: Math.random(),
  r5: Math.random(),
}))

type ParticleStyle = CSSProperties

const KEYFRAME: Record<'falling' | 'rising' | 'confetti', string> = {
  falling: 'effect-fall',
  rising: 'effect-rise',
  confetti: 'effect-burst',
}

function buildParticles(type: 'falling' | 'rising' | 'confetti'): ParticleStyle[] {
  const burst = type === 'confetti'
  return SEEDS.map((s) => {
    // Confetti erupts from the bottom edge and clusters toward the corners;
    // falling/rising spread evenly across the width.
    const corner = s.r1 < 0.5
    const left = burst ? (corner ? s.r2 * 22 : 78 + s.r2 * 22) : s.r2 * 100
    const size = 18 + s.r3 * 22
    const dur = burst ? 1.1 + s.r4 * 0.9 : 6 + s.r4 * 5
    const delay = burst ? s.r5 * 0.35 : s.r5 * 6
    const drift = burst
      ? (corner ? 1 : -1) * (30 + s.r3 * 120)
      : (s.r4 - 0.5) * 160
    const rise = -(45 + s.r5 * 45) // vh, confetti only
    const spin = (s.r2 - 0.5) * 540

    return {
      left: `${left}%`,
      fontSize: `${size}px`,
      animationName: KEYFRAME[type],
      animationDuration: `${dur}s`,
      animationDelay: `${delay}s`,
      animationTimingFunction: burst ? 'cubic-bezier(0.16,1,0.3,1)' : 'linear',
      animationIterationCount: burst ? 1 : 'infinite',
      animationFillMode: 'both',
      ['--drift' as string]: `${drift}px`,
      ['--rise' as string]: `${rise}vh`,
      ['--spin' as string]: `${spin}deg`,
      ...(type === 'falling'
        ? { top: '-10vh' }
        : { bottom: type === 'rising' ? '-10vh' : '2vh' }),
    } as ParticleStyle
  })
}

// How long the looping falling/rising streams run before auto-stopping.
// Confetti is one-shot and finishes well before this on its own.
const PARTICLE_LIFETIME_MS = 7000

export function ScreenEffects({ type, emoji, color, active }: Props) {
  const { enabled } = useScreenEffects()

  // Every effect requires an effect type to be set. This guards against stale
  // color/emoji columns rendering after the effect was reset to None.
  const isParticleType =
    type === 'falling' || type === 'rising' || type === 'confetti'
  const hasVignette = !!type && parseColors(color).length > 0
  const hasParticles = isParticleType && !!emoji?.trim()

  if (!active || !enabled) return null
  if (!hasVignette && !hasParticles) return null

  // Remount the overlay whenever the effect config changes so the particle
  // auto-stop timer restarts cleanly (no synchronous setState in an effect).
  return (
    <EffectsOverlay
      key={`${type ?? ''}|${emoji ?? ''}|${color ?? ''}`}
      type={type}
      emoji={emoji}
      color={color}
      hasVignette={hasVignette}
      hasParticles={hasParticles}
      isParticleType={isParticleType}
    />
  )
}

function EffectsOverlay({
  type,
  emoji,
  color,
  hasVignette,
  hasParticles,
  isParticleType,
}: {
  type?: ScreenEffectType
  emoji?: string
  color?: string
  hasVignette: boolean
  hasParticles: boolean
  isParticleType: boolean
}) {
  // Falling/rising loop, so retire them after a few seconds. Confetti is a
  // one-shot burst and ends on its own before the timer fires.
  const [particlesLive, setParticlesLive] = useState(true)
  useEffect(() => {
    if (!hasParticles) return
    const id = window.setTimeout(
      () => setParticlesLive(false),
      PARTICLE_LIFETIME_MS,
    )
    return () => window.clearTimeout(id)
  }, [hasParticles])

  const particles = useMemo<ParticleStyle[]>(
    () =>
      isParticleType
        ? buildParticles(type as 'falling' | 'rising' | 'confetti')
        : [],
    [isParticleType, type],
  )

  const glyph = emoji?.trim() ?? ''

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
      {hasVignette && (
        <div
          className="screen-effect-vignette absolute inset-0 animate-effect-vignette"
          style={{ background: vignetteBackground(parseColors(color)) }}
        />
      )}
      {hasParticles && (
        // Fade the whole field out at the lifetime mark so looping particles
        // retire gracefully instead of popping mid-fall.
        <div
          className="absolute inset-0 transition-opacity duration-700 ease-out"
          style={{ opacity: particlesLive ? 1 : 0 }}
        >
          {particles.map((style, i) => (
            <span
              key={i}
              className="screen-effect-particle absolute select-none will-change-transform"
              style={style}
              aria-hidden
            >
              {glyph}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
