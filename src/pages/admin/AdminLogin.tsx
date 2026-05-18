import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NeoCard } from '../../components/ui/NeoCard'
import { NeoButton } from '../../components/ui/NeoButton'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'

export function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    const sb = getSupabase()
    if (!sb) {
      setErr('Supabase is not configured. Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to your .env.')
      setLoading(false)
      return
    }
    const { error } = await sb.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setErr(error.message)
      return
    }
    nav('/admin')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-cream">
      <NeoCard tone="paper" shadow="lg" className="w-full max-w-md p-8">
        <div className="font-display text-2xl font-bold uppercase tracking-wider mb-1">
          Admin sign-in
        </div>
        <div className="text-xs text-ink-soft mb-6">
          For the puzzle dispatcher only.
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-neo bg-cream-soft px-3 py-2 text-sm font-bold outline-none focus:bg-paper"
            />
          </label>
          {err && (
            <div className="border-neo-2 bg-coral text-ink-static px-3 py-2 text-xs font-bold">
              {err}
            </div>
          )}
          <NeoButton type="submit" tone="lime" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in →'}
          </NeoButton>
          {!isSupabaseConfigured() && (
            <div className="text-[10px] uppercase tracking-wider text-ink-soft mt-2">
              ⚠ Supabase env vars missing — see <code>.env.example</code>.
            </div>
          )}
        </form>
      </NeoCard>
    </div>
  )
}
