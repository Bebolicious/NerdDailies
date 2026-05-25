import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  children: ReactNode
  tone?: 'lime' | 'mustard' | 'coral' | 'blue' | 'violet' | 'ink' | 'paper'
  className?: string
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  lime: 'bg-lime text-ink-static',
  mustard: 'bg-mustard text-ink-static',
  coral: 'bg-coral text-ink-static',
  blue: 'bg-blue text-paper-static',
  violet: 'bg-violet text-paper-static',
  ink: 'bg-emphasis text-paper-static',
  paper: 'bg-paper text-ink',
}

export function TagPill({ children, tone = 'lime', className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center border-neo-2 px-2 py-1 font-display text-xs uppercase tracking-wider font-bold whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
