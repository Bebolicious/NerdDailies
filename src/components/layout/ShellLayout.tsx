import { useState, type ReactNode } from 'react'
import { NavBar } from './NavBar'
import { TodaySidebar } from './TodaySidebar'
import { DevDateBanner } from './DevDateBanner'

export function ShellLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar onOpenSidebar={() => setSidebarOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8 flex flex-col min-h-0">
          {children}
        </main>
        <TodaySidebar
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      <DevDateBanner />
    </div>
  )
}
