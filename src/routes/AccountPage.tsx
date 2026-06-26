import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { CAPABILITIES } from '../auth/capabilities'
import { PageHeader, Tag } from '../components/ui'

export default function AccountPage() {
  const { user, isAdmin, hasCapability, signOut } = useAuth()

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Account" />
      <div className="scroll-y flex-1 space-y-5 px-4 py-4">
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-lg font-semibold">{user?.name || 'You'}</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span>{isAdmin ? 'Admin' : 'Member'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CAPABILITIES.filter((c) => hasCapability(c.key)).map((c) => (
              <Tag key={c.key}>{c.label}</Tag>
            ))}
          </div>
        </div>

        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 active:scale-[0.99]"
          >
            <span className="font-medium">Manage family</span>
            <span className="text-muted">›</span>
          </Link>
        )}

        <button
          onClick={signOut}
          className="text-sm font-medium text-danger active:scale-95"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
