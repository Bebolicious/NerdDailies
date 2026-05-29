import { useState } from 'react'
import { Clock, Flame, Menu, Settings } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { SettingsModal } from '../ui/SettingsModal'
import { useCountdownToMidnight } from '../../hooks/useCountdown'
import { useStreak } from '../../hooks/useStreak'
import { cn } from '../../lib/cn'

export function NavBar({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const streak = useStreak()
  const countdown = useCountdownToMidnight()
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <header className="border-b-[3px] border-stroke bg-cream">
      <div className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3 group">
          <img
            src="/logo.png"
            alt="Dailies logo"
            width={44}
            height={44}
            className="h-11 w-11"
          />
          <div>
            <div className="font-display text-2xl font-bold tracking-wider uppercase text-ink leading-none">
              Dailies
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft mt-1">
              / Daily mini-games for nerds /
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-5">
          <div
            className="hidden sm:flex items-center gap-1.5 text-ink-soft font-display text-[10px] uppercase tracking-wider"
            title="Time until new puzzles drop at local midnight"
          >
            <Clock className="h-3 w-3 stroke-[3]" />
            <span>Next drop</span>
            <span className="text-ink font-bold tabular-nums">{countdown}</span>
          </div>
          <span className="hidden sm:inline text-ink-soft">|</span>
          <div className="flex items-center gap-2 text-coral font-display font-bold">
            <Flame className="h-5 w-5 fill-coral" />
            <span className="text-base">{streak}</span>
          </div>
          <span className="text-ink-soft">|</span>
          <NavBarLink to="/how-to-play">How to play</NavBarLink>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            className="border-neo-2 p-2 font-display text-xs uppercase tracking-wider font-bold hover:bg-emphasis hover:text-paper-static transition-colors"
          >
            <Settings className="h-3.5 w-3.5 stroke-[3]" />
          </button>
          {onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              aria-label="Open games menu"
              className="lg:hidden border-neo-2 p-2 font-display text-xs uppercase tracking-wider font-bold hover:bg-emphasis hover:text-paper-static transition-colors"
            >
              <Menu className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          )}
        </nav>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  )
}

function NavBarLink({
  to,
  children,
}: {
  to: string
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'font-display text-xs uppercase tracking-wider font-bold transition-colors',
          isActive ? 'text-coral' : 'text-ink hover:text-coral',
        )
      }
    >
      {children}
    </NavLink>
  )
}
