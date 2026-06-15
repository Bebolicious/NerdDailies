import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  tone?:
    | 'paper'
    | 'coral'
    | 'lime'
    | 'mustard'
    | 'blue'
    | 'violet'
    | 'teal'
    | 'pink'
    | 'ink'
  shadow?: 'none' | 'sm' | 'md' | 'lg'
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  paper: 'bg-paper',
  coral: 'bg-coral text-ink-static',
  lime: 'bg-lime text-ink-static',
  mustard: 'bg-mustard text-ink-static',
  blue: 'bg-blue text-paper-static',
  violet: 'bg-violet text-paper-static',
  teal: 'bg-teal text-ink-static',
  pink: 'bg-pink',
  ink: 'bg-emphasis text-paper-static',
}

const shadowClass: Record<NonNullable<Props['shadow']>, string> = {
  none: '',
  sm: 'shadow-neo-sm',
  md: 'shadow-neo',
  lg: 'shadow-neo-lg',
}

export function NeoCard({
  children,
  tone = 'paper',
  shadow = 'md',
  className,
  ...rest
}: Props) {
  return (
    <div
      className={cn(
        'border-neo',
        toneClass[tone],
        shadowClass[shadow],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
