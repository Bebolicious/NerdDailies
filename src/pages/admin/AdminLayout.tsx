import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, LogOut } from 'lucide-react'
import { NeoButton } from '../../components/ui/NeoButton'
import { getSupabase } from '../../lib/supabase'
import { useAdminSession } from '../../hooks/useAdminSession'
import { useEffect } from 'react'

export function AdminLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const { email, loading } = useAdminSession()
  const nav = useNavigate()

  useEffect(() => {
    if (!loading && !email) nav('/admin/login')
  }, [email, loading, nav])

  if (loading) return null

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b-[3px] border-stroke px-6 py-4 flex items-center justify-between bg-paper">
        <div className="flex items-center gap-4">
          <Link
            to="/admin"
            className="border-neo-2 px-3 py-2 font-display text-xs uppercase tracking-wider font-bold hover:bg-emphasis hover:text-paper-static"
          >
            <ChevronLeft className="inline h-3 w-3 mr-1" />
            Back
          </Link>
          <div>
            <div className="font-display text-xl font-bold uppercase tracking-wider">
              {title}
            </div>
            {subtitle && (
              <div className="text-xs text-ink-soft mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-soft">{email}</span>
          <NeoButton
            tone="paper"
            size="sm"
            onClick={async () => {
              await getSupabase()?.auth.signOut()
              nav('/admin/login')
            }}
          >
            <LogOut className="inline h-3 w-3 mr-1" /> Sign out
          </NeoButton>
        </div>
      </header>
      <main className="p-6 max-w-3xl mx-auto">{children}</main>
    </div>
  )
}
