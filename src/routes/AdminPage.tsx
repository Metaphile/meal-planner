import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { CAPABILITIES, type Capability } from '../auth/capabilities'
import {
  createInvite,
  createMember,
  listUsers,
  removeUser,
  setCapabilities,
  setRole,
  type FamilyUser,
} from '../auth/admin'
import { GhostButton, PageHeader, PrimaryButton, TextInput } from '../components/ui'

export default function AdminPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<FamilyUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const refresh = () =>
    listUsers()
      .then(setUsers)
      .catch((e) => {
        if (e?.isAbort) return // ignore SDK auto-cancellation
        setError(e?.message || 'Could not load family.')
      })

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Family"
        action={<GhostButton onClick={() => history.back()}>Done</GhostButton>}
      />
      <div className="scroll-y flex-1 space-y-3 px-4 py-4">
        {error && <p className="text-sm text-danger">{error}</p>}

        {!adding ? (
          <PrimaryButton onClick={() => setAdding(true)} className="w-full">
            + Add person
          </PrimaryButton>
        ) : (
          <AddPersonForm
            onClose={() => setAdding(false)}
            onCreated={() => {
              setAdding(false)
              void refresh()
            }}
          />
        )}

        <div className="space-y-2">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === me?.id}
              onChanged={refresh}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CapabilityChecklist({
  value,
  onChange,
}: {
  value: Capability[]
  onChange: (next: Capability[]) => void
}) {
  const toggle = (cap: Capability) =>
    onChange(value.includes(cap) ? value.filter((c) => c !== cap) : [...value, cap])
  return (
    <div className="flex flex-col gap-1.5">
      {CAPABILITIES.map((c) => (
        <label key={c.key} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.includes(c.key)}
            onChange={() => toggle(c.key)}
            className="h-4 w-4 accent-brand"
          />
          {c.label}
        </label>
      ))}
    </div>
  )
}

function RolePicker({
  role,
  onChange,
}: {
  role: 'admin' | 'member'
  onChange: (r: 'admin' | 'member') => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      {(['member', 'admin'] as const).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-3 py-1.5 text-sm capitalize ${
            role === r ? 'bg-brand text-on-brand' : 'bg-surface text-muted'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

function InviteLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="rounded-lg border border-brand bg-surface-2 p-2">
      <div className="mb-1 text-xs text-muted">
        Share this one-time link (valid 7 days):
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
        <button
          onClick={copy}
          className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-on-brand active:scale-95"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function AddPersonForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [caps, setCaps] = useState<Capability[]>(['edit_plan'])
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const { inviteLink } = await createMember({ name: name.trim(), role, capabilities: caps })
      setLink(inviteLink)
    } catch (e) {
      setError((e as { message?: string })?.message || 'Could not add person.')
    } finally {
      setBusy(false)
    }
  }

  if (link) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
        <div className="font-medium">{name} added</div>
        <InviteLinkBox link={link} />
        <PrimaryButton onClick={onCreated} className="w-full">
          Done
        </PrimaryButton>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Mia)"
        aria-label="Name"
        autoFocus
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Role</span>
        <RolePicker role={role} onChange={setRole} />
      </div>
      {role === 'member' ? (
        <div>
          <div className="mb-1 text-sm text-muted">Can…</div>
          <CapabilityChecklist value={caps} onChange={setCaps} />
        </div>
      ) : (
        <p className="text-sm text-muted">Admins can do everything.</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <PrimaryButton onClick={create} disabled={!name.trim() || busy} className="flex-1">
          {busy ? 'Adding…' : 'Add & create invite'}
        </PrimaryButton>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
      </div>
    </div>
  )
}

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: FamilyUser
  isSelf: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const changeRole = async (role: 'admin' | 'member') => {
    setBusy(true)
    await setRole(user.id, role).catch(() => {})
    setBusy(false)
    onChanged()
  }
  const changeCaps = async (caps: Capability[]) => {
    setBusy(true)
    await setCapabilities(user.id, caps).catch(() => {})
    setBusy(false)
    onChanged()
  }
  const newInvite = async () => {
    setBusy(true)
    setLink(await createInvite(user.id).catch(() => null))
    setBusy(false)
  }
  const remove = async () => {
    if (!confirm(`Remove ${user.name}? They'll lose access.`)) return
    await removeUser(user.id).catch(() => {})
    onChanged()
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-medium">
          {user.name} {isSelf && <span className="text-muted">(you)</span>}
        </span>
        <span className="text-xs capitalize text-muted">{user.role}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Role</span>
            {isSelf ? (
              <span className="text-sm capitalize text-muted">
                {user.role} (you)
              </span>
            ) : (
              <RolePicker role={user.role} onChange={changeRole} />
            )}
          </div>

          {user.role === 'member' ? (
            <div>
              <div className="mb-1 text-sm text-muted">Can…</div>
              <CapabilityChecklist
                value={user.capabilities as Capability[]}
                onChange={changeCaps}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">Admins can do everything.</p>
          )}

          {link && <InviteLinkBox link={link} />}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={newInvite}
              disabled={busy}
              className="text-sm font-medium text-brand active:scale-95"
            >
              New invite link
            </button>
            {!isSelf && (
              <button
                onClick={remove}
                className="text-sm font-medium text-danger active:scale-95"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
