import { useEffect, useState } from 'react'
import { useAuth, type Access } from '../auth/AuthProvider'
import {
  INVITE_TTL_DAYS,
  addMember,
  createInvite,
  listMembers,
  reasonOf,
  removeMember,
  rename,
  setAccess,
  type Member,
} from '../auth/group'
import {
  ConfirmDialog,
  GhostButton,
  PageHeader,
  PrimaryButton,
  TextInput,
} from '../components/ui'

const ACCESS_LABEL: Record<Access, string> = {
  writer: 'Writer',
  reader: 'Reader',
}
const ACCESS_HINT: Record<Access, string> = {
  writer:
    'Writes recipes, picks what’s wanted, ticks off ingredients and add-ons, and looks after the group.',
  reader:
    'Browses recipes and the ingredients list, and keeps favorites of their own.',
}

/**
 * You (your name, which you can change, and your access, which you can't),
 * and the group you're in: who's in it, and — for writers — inviting
 * people, and changing or removing others.
 */
export default function AccountPage() {
  const { user, canWrite, signOut } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = () =>
    listMembers()
      .then((m) => {
        setMembers(m)
        setError(null)
      })
      .catch((e) => {
        if (e?.isAbort) return // (the SDK's auto-cancellation)
        setError(reasonOf(e, 'Couldn’t load the group.'))
      })

  useEffect(() => {
    void refresh()
  }, [])

  if (!user) return null
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Account" />
      <div className="scroll-y flex-1 space-y-6 px-4 pt-3 pb-8">
        <YouCard
          id={user.id}
          name={user.name}
          access={user.role}
          onRenamed={refresh}
        />

        <section>
          <GroupTab />
          <div className="kraft-pocket space-y-2 rounded-tl-none p-2">
            {error && (
              <p className="rounded-lg bg-paper px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="paper-card divide-y divide-line-blue px-4 py-1">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isYou={m.id === user.id}
                  canManage={canWrite && m.id !== user.id}
                  onChanged={refresh}
                />
              ))}
            </div>
            {canWrite && <InviteSomeone onAdded={refresh} />}
          </div>
        </section>

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

/** "Group", on a divider tab. */
function GroupTab() {
  return (
    <div className="relative h-[30px]">
      <span className="paper-serif absolute bottom-[-1px] left-[18px] z-[1] rounded-t-lg border border-b-0 border-kraft-edge bg-kraft px-3 pt-1 pb-[5px] text-sm font-semibold text-kraft-ink">
        Group
      </span>
    </div>
  )
}

/** You, on an index card: your name (change it here) and your access. */
function YouCard({
  id,
  name,
  access,
  onRenamed,
}: {
  id: string
  name: string
  access: Access
  onRenamed: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const next = draft.trim()
    if (!next || next === name) return setEditing(false)
    setBusy(true)
    try {
      await rename(id, next)
      setEditing(false)
      setError(null)
      onRenamed()
    } catch (e) {
      setError(reasonOf(e, 'Couldn’t change your name.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="paper-card relative px-5 pt-3.5 pb-4">
      <div className="paper-frame" />
      {editing ? (
        <div className="relative flex items-center gap-2 pb-1">
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            aria-label="Your name"
            autoFocus
            enterKeyHint="done"
          />
          <PrimaryButton onClick={() => void save()} disabled={busy}>
            Save
          </PrimaryButton>
        </div>
      ) : (
        <div className="paper-rule relative flex items-baseline justify-between gap-3 pb-1.5">
          <span className="font-hand text-[30px] font-semibold leading-8 text-black">
            {name || 'You'}
          </span>
          <button
            onClick={() => {
              setDraft(name)
              setEditing(true)
            }}
            className="shrink-0 text-sm font-medium text-brand-ink active:opacity-60"
          >
            Change name
          </button>
        </div>
      )}
      {error && <p className="relative pt-1 text-sm text-danger">{error}</p>}
      <div className="relative pt-2.5">
        <div className="paper-serif text-[17px] font-semibold">
          {ACCESS_LABEL[access]}
        </div>
        <p className="text-sm text-muted">{ACCESS_HINT[access]}</p>
      </div>
    </div>
  )
}

/** Writer or Reader, to pick. */
function AccessPicker({
  value,
  onChange,
  disabled,
}: {
  value: Access
  onChange: (a: Access) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Access"
      className="inline-flex overflow-hidden rounded-full border border-kraft-edge"
    >
      {(['reader', 'writer'] as const).map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          disabled={disabled}
          onClick={() => value !== a && onChange(a)}
          className={`px-3.5 py-1.5 text-sm font-medium ${
            value === a ? 'bg-brand text-on-brand' : 'bg-paper text-muted'
          }`}
        >
          {ACCESS_LABEL[a]}
        </button>
      ))}
    </div>
  )
}

/** A member of the group; for writers (not on their own row), tapped open
 *  to change their access, send a new invite link, or remove them. */
function MemberRow({
  member,
  isYou,
  canManage,
  onChanged,
}: {
  member: Member
  isYou: boolean
  canManage: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (f: () => Promise<void>, fail: string) => {
    setBusy(true)
    setError(null)
    try {
      await f()
    } catch (e) {
      setError(reasonOf(e, fail))
    } finally {
      setBusy(false)
    }
  }

  const summary = (
    <>
      <span className="paper-serif text-[17px]">
        {member.name || 'Someone'}
        {isYou && <span className="text-muted"> (you)</span>}
      </span>
      <span className="text-sm text-muted">{ACCESS_LABEL[member.role]}</span>
    </>
  )

  if (!canManage)
    return (
      <div className="flex items-baseline justify-between gap-3 py-2.5">
        {summary}
      </div>
    )

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left"
      >
        {summary}
      </button>
      {open && (
        <div className="space-y-3 pb-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Access</span>
            <AccessPicker
              value={member.role}
              disabled={busy}
              onChange={(a) =>
                void run(async () => {
                  await setAccess(member.id, a)
                  onChanged()
                }, 'Couldn’t change their access.')
              }
            />
          </div>
          {link && <InviteLink name={member.name} link={link} />}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center justify-between">
            <button
              onClick={() =>
                void run(async () => {
                  setLink(await createInvite(member.id))
                }, 'Couldn’t make an invite link.')
              }
              disabled={busy}
              className="text-sm font-medium text-brand-ink active:opacity-60"
            >
              New invite link
            </button>
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="text-sm font-medium text-danger active:opacity-60"
            >
              Remove
            </button>
          </div>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Remove ${member.name || 'them'}?`}
          message="They’ll no longer be able to open the app."
          confirmLabel="Remove"
          cancelLabel="Keep"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            void run(async () => {
              await removeMember(member.id)
              onChanged()
            }, 'Couldn’t remove them.')
          }}
        />
      )}
    </div>
  )
}

/** Writers: add someone to the group, with a link for them to join by. */
function InviteSomeone({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [access, setAccessPick] = useState<Access>('reader')
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setOpen(false)
    setName('')
    setAccessPick('reader')
    setLink(null)
    setError(null)
  }

  if (!open)
    return (
      <PrimaryButton onClick={() => setOpen(true)} className="w-full">
        Invite someone
      </PrimaryButton>
    )

  if (link)
    return (
      <div className="paper-card space-y-3 p-3">
        <div className="paper-serif text-[17px] font-semibold">
          {name} is in the group
        </div>
        <InviteLink name={name} link={link} />
        <PrimaryButton onClick={reset} className="w-full">
          Done
        </PrimaryButton>
      </div>
    )

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const { inviteLink } = await addMember({ name: name.trim(), role: access })
      setLink(inviteLink)
      onAdded()
    } catch (e) {
      setError(reasonOf(e, 'Couldn’t add them.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="paper-card space-y-3 p-3">
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Their name"
        aria-label="Their name"
        autoFocus
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Access</span>
        <AccessPicker value={access} onChange={setAccessPick} />
      </div>
      <p className="text-xs text-muted">{ACCESS_HINT[access]}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <PrimaryButton
          onClick={() => void add()}
          disabled={!name.trim() || busy}
          className="flex-1"
        >
          {busy ? 'Adding…' : 'Add and make an invite link'}
        </PrimaryButton>
        <GhostButton onClick={reset}>Cancel</GhostButton>
      </div>
    </div>
  )
}

/** A one-time invite link: shared from the phone (or copied). */
function InviteLink({ name, link }: { name: string; link: string }) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'
  const share = async () => {
    try {
      await navigator.share({
        title: 'Meal Planner',
        text: `${name ? `${name}, here's` : 'Here’s'} your invite to our Meal Planner:`,
        url: link,
      })
    } catch {
      // (Share sheet dismissed.)
    }
  }
  const copy = async () => {
    if (await copyText(link)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <div className="rounded-lg border border-kraft-edge bg-surface-2 p-2.5">
      <div className="mb-1.5 text-xs text-muted">
        A one-time link, good for {INVITE_TTL_DAYS} days. Whoever opens it
        joins as {name || 'them'}.
      </div>
      <div className="flex items-center gap-2">
        <code className="selectable min-w-0 flex-1 truncate text-xs">{link}</code>
        {canShare && (
          <button
            onClick={() => void share()}
            className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-on-brand active:scale-95"
          >
            Share
          </button>
        )}
        <button
          onClick={() => void copy()}
          className="shrink-0 rounded-full border border-kraft-edge bg-paper px-3 py-1 text-xs font-semibold text-on-brand active:scale-95"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/**
 * Copy text: the Clipboard API where the page has it — only on HTTPS (or
 * localhost) — and otherwise the old way, selecting it in a hidden field.
 * (Called from a tap, as both need.)
 */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // (Refused: try the old way.)
    }
  }
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true // (no keyboard on iOS)
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  document.body.appendChild(field)
  try {
    field.select()
    field.setSelectionRange(0, text.length) // (iOS)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}
