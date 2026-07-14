import { useEffect } from 'react'
import { Moon, Sun, X } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useReadability } from '../../hooks/useReadability'
import { useScreenEffects } from '../../hooks/useScreenEffects'
import { useTourPrompt } from '../../hooks/useTourPrompt'
import { cn } from '../../lib/cn'

type Props = {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const { theme, toggle: toggleTheme } = useTheme()
  const { readable, toggle: toggleReadable } = useReadability()
  const { enabled: effectsOn, toggle: toggleEffects } = useScreenEffects()
  const { enabled: tourPromptOn, toggle: toggleTourPrompt } = useTourPrompt()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-emphasis/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="border-neo shadow-neo-lg bg-paper text-ink w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between border-b-[3px] border-stroke px-5 py-3 bg-emphasis text-paper-static">
          <h2 className="font-display text-lg uppercase tracking-wider font-bold">
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="border-neo-2 p-1.5 hover:bg-coral hover:text-ink-static transition-colors"
          >
            <X className="h-3.5 w-3.5 stroke-[3]" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <SettingRow
            label="Dark mode"
            description={theme === 'dark' ? 'On' : 'Off'}
          >
            <ToggleButton
              active={theme === 'dark'}
              onClick={toggleTheme}
              ariaLabel={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 stroke-[3]" />
              ) : (
                <Moon className="h-3.5 w-3.5 stroke-[3]" />
              )}
            </ToggleButton>
          </SettingRow>

          <SettingRow
            label="Increased readability"
            description="Swap pixel fonts for an easy-to-read typeface"
          >
            <ToggleSwitch
              active={readable}
              onClick={toggleReadable}
              ariaLabel="Toggle increased readability"
            />
          </SettingRow>

          <SettingRow
            label="Screen effects"
            description="Celebration animations on solve (banners still show)"
          >
            <ToggleSwitch
              active={effectsOn}
              onClick={toggleEffects}
              ariaLabel="Toggle screen effects"
            />
          </SettingRow>

          <SettingRow
            label="Daily Tour prompt"
            description="Ask to play The Tour on your first visit each day"
          >
            <ToggleSwitch
              active={tourPromptOn}
              onClick={toggleTourPrompt}
              ariaLabel="Toggle daily tour prompt"
            />
          </SettingRow>
        </div>
      </div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-display text-sm uppercase tracking-wider font-bold text-ink">
          {label}
        </div>
        {description && (
          <div className="text-xs text-ink-soft mt-0.5">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        'border-neo-2 p-2 font-display font-bold transition-colors',
        active
          ? 'bg-emphasis text-paper-static'
          : 'bg-paper hover:bg-emphasis hover:text-paper-static',
      )}
    >
      {children}
    </button>
  )
}

function ToggleSwitch({
  active,
  onClick,
  ariaLabel,
}: {
  active: boolean
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      className={cn(
        'border-neo-2 w-14 h-7 relative transition-colors',
        active ? 'bg-lime' : 'bg-cream-soft',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-stroke transition-all',
          active ? 'left-[calc(100%-1.25rem)]' : 'left-1',
        )}
      />
    </button>
  )
}
