import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  tone?:
    | 'coral'
    | 'lime'
    | 'mustard'
    | 'blue'
    | 'violet'
    | 'teal'
    | 'orange'
    | 'ink'
    | 'paper'
  size?: 'sm' | 'md' | 'lg'
}

// Saturated-bg tones (coral/lime/mustard/blue) use *-static text so contrast
// stays correct in both themes. Themed tones (ink/paper) naturally invert.
const toneClass: Record<NonNullable<Props['tone']>, string> = {
  coral: 'bg-coral text-ink-static hover:bg-coral-deep',
  lime: 'bg-lime text-ink-static hover:bg-lime-deep',
  mustard: 'bg-mustard text-ink-static hover:bg-mustard-deep',
  blue: 'bg-blue text-paper-static hover:bg-blue-deep',
  violet: 'bg-violet text-paper-static hover:bg-violet-deep',
  teal: 'bg-teal text-ink-static hover:bg-teal-deep',
  orange: 'bg-orange text-ink-static hover:bg-orange-deep',
  ink: 'bg-emphasis text-paper-static hover:bg-emphasis-hover',
  paper: 'bg-paper text-ink hover:bg-cream-soft',
}

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'px-[11px] py-[5px] text-xs',
  md: 'px-[19px] py-[11px] text-sm',
  lg: 'px-[27px] py-[15px] text-base',
}

export function NeoButton({
  children,
  tone = 'coral',
  size = 'md',
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={cn(
        'border-neo shadow-neo font-display tracking-wider uppercase font-bold transition-all',
        'hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-lg',
        'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-neo disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-neo',
        toneClass[tone],
        sizeClass[size],
        className,
      )}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}
