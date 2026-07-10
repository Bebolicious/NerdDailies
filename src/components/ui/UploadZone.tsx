import { useEffect, useRef, useState } from 'react'
import { Upload, ClipboardPaste } from 'lucide-react'

// Shared empty-state for every admin image slot. Renders an absolutely-filled
// click target over the (relatively-positioned) slot container plus a hidden
// file input.
//
// Interaction: first click *arms* the slot (Ctrl+V pastes a clipboard image —
// e.g. a Snipping Tool grab — straight into the upload); clicking the armed
// slot again opens the usual file explorer. Only one slot is armed at a time
// (arming broadcasts on a window event so siblings disarm), and Escape or an
// outside click disarms.

const ARMED_EVENT = 'dailies:upload-armed'

// Monotonic id so each mounted zone can tell its own arm event from a sibling's.
let nextId = 0

function pasteableImage(items: DataTransferItemList | undefined): File | null {
  if (!items) return null
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue
      // Clipboard files are sometimes nameless; give the pipeline an extension.
      if (file.name) return file
      const ext = file.type.split('/')[1] || 'png'
      return new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type })
    }
  }
  return null
}

export function UploadZone({
  onUpload,
  label = 'Upload',
  accept = 'image/*',
  iconClassName = 'h-5 w-5',
  className = '',
}: {
  onUpload: (file: File) => void
  label?: string
  accept?: string
  iconClassName?: string
  className?: string
}) {
  const idRef = useRef(nextId++)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [armed, setArmed] = useState(false)

  // Disarm when another zone arms.
  useEffect(() => {
    function onArmed(e: Event) {
      if ((e as CustomEvent<number>).detail !== idRef.current) setArmed(false)
    }
    window.addEventListener(ARMED_EVENT, onArmed)
    return () => window.removeEventListener(ARMED_EVENT, onArmed)
  }, [])

  // While armed: catch clipboard image pastes, plus Escape / outside-click disarm.
  useEffect(() => {
    if (!armed) return
    function onPaste(e: ClipboardEvent) {
      const file = pasteableImage(e.clipboardData?.items)
      if (!file) return // text/other paste — let it through untouched.
      e.preventDefault()
      onUpload(file)
      setArmed(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setArmed(false)
    }
    function onMouseDown(e: MouseEvent) {
      if (!buttonRef.current?.contains(e.target as Node)) setArmed(false)
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [armed, onUpload])

  function handleClick() {
    if (armed) {
      inputRef.current?.click()
      setArmed(false)
    } else {
      setArmed(true)
      window.dispatchEvent(new CustomEvent(ARMED_EVENT, { detail: idRef.current }))
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        className={
          'absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-ink-soft transition ' +
          (armed ? 'ring-2 ring-inset ring-ink bg-mustard/25 ' : '') +
          className
        }
      >
        {armed ? (
          <>
            <ClipboardPaste className={iconClassName + ' stroke-[2.5]'} />
            <span className="font-display text-[10px] uppercase tracking-wider font-bold leading-tight">
              Ctrl+V to paste
            </span>
            <span className="font-display text-[8px] uppercase tracking-wider text-ink-soft/70">
              or click to browse
            </span>
          </>
        ) : (
          <>
            <Upload className={iconClassName + ' stroke-[2.5]'} />
            <span className="font-display text-[10px] uppercase tracking-wider font-bold leading-tight">
              {label}
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ''
        }}
      />
    </>
  )
}
