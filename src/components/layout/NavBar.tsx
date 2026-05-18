import { Flame, Moon, Sun } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { PixelLogo } from '../ui/PixelLogo'
import { useStreak } from '../../hooks/useStreak'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../lib/cn'

export function NavBar() {
  const streak = useStreak()
  const { theme, toggle } = useTheme()
  return (
    <header className="border-b-[3px] border-stroke bg-cream">
      <div className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3 group">
          <PixelLogo size={44} />
          <div>
            <div className="font-display text-2xl font-bold tracking-wider uppercase text-ink leading-none">
              Dailies
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft mt-1">
              / pixel puzzles for game nerds /
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-5">
          <div className="flex items-center gap-2 text-coral font-display font-bold">
            <Flame className="h-5 w-5 fill-coral" />
            <span className="text-base">{streak}</span>
          </div>
          <span className="text-ink-soft">|</span>
          <NavBarLink to="/how-to-play">How to play</NavBarLink>
          <NavBarLink to="/stats">Stats</NavBarLink>
          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="border-neo-2 p-2 font-display text-xs uppercase tracking-wider font-bold hover:bg-emphasis hover:text-paper-static transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5 stroke-[3]" />
            ) : (
              <Moon className="h-3.5 w-3.5 stroke-[3]" />
            )}
          </button>
        </nav>
      </div>
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
