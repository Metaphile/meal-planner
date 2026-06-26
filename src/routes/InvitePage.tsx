import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pb } from '../auth/pb'

// Opened from an invite link: /invite#<token>. Exchanges the one-time token for
// a session via the backend hook, stores it, and routes into the app.
export default function InvitePage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // accept exactly once (invites are single-use)
    ran.current = true

    const token = window.location.hash.replace(/^#/, '').trim()
    if (!token) {
      setError('This invite link is missing its code.')
      return
    }

    ;(async () => {
      try {
        const data = await pb.send('/api/invite/accept', {
          method: 'POST',
          body: { token },
        })
        pb.authStore.save(data.token, data.record)
        navigate('/plan', { replace: true })
      } catch (e) {
        const msg =
          (e as { response?: { message?: string }; message?: string })?.response
            ?.message ||
          (e as { message?: string })?.message ||
          'This invite link is invalid or has expired.'
        setError(msg)
      }
    })()
  }, [navigate])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      {!error ? (
        <p className="animate-pulse text-muted">Signing you in…</p>
      ) : (
        <>
          <p className="text-base font-medium">{error}</p>
          <p className="max-w-xs text-sm text-muted">
            Ask a family admin to send you a fresh invite link.
          </p>
          <Link
            to="/"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium"
          >
            Back
          </Link>
        </>
      )}
    </div>
  )
}
