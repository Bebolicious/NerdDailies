import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase'

export function useAdminSession() {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) {
      setLoading(false)
      return
    }
    sb.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null)
      setLoading(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { email, loading, signedIn: Boolean(email) }
}
