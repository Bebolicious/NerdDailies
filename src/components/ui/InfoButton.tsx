import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

type Props = {
  text: string
  title?: string
  ariaLabel?: string
  className?: string
}

export function InfoButton({
  text,
  title = 'How to play',
  ariaLabel = 'How to play',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={className}>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={ariaLabel}
          aria-expanded={open}
          className="border-neo-2 bg-paper text-ink p-2 font-display text-xs uppercase tracking-wider font-bold hover:bg-emphasis hover:text-paper-static transition-colors"
        >
          <Info className="h-3.5 w-3.5 stroke-[3]" />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label={title}
            className="absolute right-0 top-[calc(100%+8px)] w-64 border-neo bg-paper text-ink shadow-neo-lg p-3 z-30"
          >
            <div className="font-display text-[10px] uppercase tracking-wider font-bold text-ink-soft mb-1">
              {title}
            </div>
            <div className="text-xs leading-relaxed">{text}</div>
          </div>
        )}
      </div>
    </div>
  )
}
