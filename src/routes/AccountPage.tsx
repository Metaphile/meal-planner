import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { CAPABILITIES } from '../auth/capabilities'
import { PageHeader } from '../components/ui'

export default function AccountPage() {
  const { user, isAdmin, hasCapability, signOut } = useAuth()

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Account" />
      <div className="scroll-y flex-1 space-y-5 px-4 py-4">
        {/* You, on an index card. */}
        <div className="paper-card relative px-5 pt-3.5 pb-4">
          <div className="paper-frame" />
          <div className="paper-rule paper-serif pb-1.5 text-[21px] font-semibold leading-7">
            {user?.name || 'You'}
          </div>
          <div className="paper-lines mt-px text-[15px]">
            <div className="flex justify-between gap-3">
              <span>Role</span>
              <span className="text-muted">{isAdmin ? 'Admin' : 'Member'}</span>
            </div>
            {CAPABILITIES.filter((c) => hasCapability(c.key)).map((c) => (
              <div key={c.key}>{c.label}</div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <Link
            to="/admin"
            className="paper-card flex items-center justify-between px-4 py-3 active:scale-[0.99]"
          >
            <span className="paper-serif text-[17px] font-semibold">
              Manage family
            </span>
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
