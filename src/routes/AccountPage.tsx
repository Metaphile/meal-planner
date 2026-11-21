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
import { isIOS, isInstalled, useInstallPrompt } from '../lib/install'

const ACCESS_LABEL: Record<Access, string> = {
  writer: 'Writer',
  reader: 'Reader',
}
/** (Shown when inviting someone, under the access picked.) */
const ACCESS_HINT: Record<Access, string> = {
  writer:
    'Writes recipes, picks what’s wanted, ticks off ingredients and add-ons, and looks after the group.',
  reader:
    'Browses recipes and the ingredients list, and keeps favorites of their own.',
}

/**
 * The group you're in: who's in it; your own name, to change (your access
 * you can't); and — for writers — inviting people, and changing or removing
 * others.
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
        <section>
          <GroupTab />
          <div className="kraft-pocket space-y-2 rounded-tl-none p-2">
            {error && (
              <p className="rounded-lg bg-paper px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="paper-card divide-y divide-line-blue px-4 py-1">
              {members.map((m) =>
                m.id === user.id ? (
                  <YouRow
                    key={m.id}
                    member={m}
                    canInvite={canWrite}
                    onRenamed={refresh}
                  />
                ) : (
                  <MemberRow
                    key={m.id}
                    member={m}
                    canManage={canWrite}
                    onChanged={refresh}
                  />
                ),
              )}
            </div>
            {canWrite && <InviteSomeone onAdded={refresh} />}
          </div>
        </section>

        <HomeScreen userId={user.id} />

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

/** Your own row: tapped open to change your name, and (writers) to get a
 *  link to sign in on another device — such as the app added to an iPhone's
 *  Home Screen, which keeps a sign-in of its own. (Your access is shown, not
 *  changed: nobody changes their own.) */
function YouRow({
  member,
  canInvite,
  onRenamed,
}: {
  member: Member
  canInvite: boolean
  onRenamed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [draft, setDraft] = useState(member.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setOpen(false)
    setError(null)
    setLink(null)
  }
  const newLink = async () => {
    setBusy(true)
    setError(null)
    try {
      setLink(await createInvite(member.id))
    } catch (e) {
      setError(reasonOf(e, 'Couldn’t make a sign-in link.'))
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    const next = draft.trim()
    if (!next || next === member.name) return close()
    setBusy(true)
    try {
      await rename(member.id, next)
      close()
      onRenamed()
    } catch (e) {
      setError(reasonOf(e, 'Couldn’t change your name.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (open) return close()
          setDraft(member.name)
          setOpen(true)
        }}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left"
      >
        <span className="paper-serif text-[17px]">
          {member.name || 'You'}
          <span className="text-muted"> (you)</span>
        </span>
        <span className="text-sm text-muted">{ACCESS_LABEL[member.role]}</span>
      </button>
      {open && (
        <div className="space-y-2 pb-3">
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            aria-label="Your name"
            autoFocus
            autoCapitalize="words"
            enterKeyHint="done"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <GhostButton onClick={close}>Cancel</GhostButton>
            <PrimaryButton onClick={() => void save()} disabled={busy}>
              Save
            </PrimaryButton>
          </div>
          {canInvite &&
            (link ? (
              <InviteLink name={member.name} link={link} />
            ) : (
              <button
                onClick={() => void newLink()}
                disabled={busy}
                className="text-sm font-medium text-brand-ink active:opacity-60"
              >
                Sign in on another device
              </button>
            ))}
        </div>
      )}
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

/** Someone else in the group; for writers, tapped open to change their
 *  access, send a new invite link, or remove them. */
function MemberRow({
  member,
  canManage,
  onChanged,
}: {
  member: Member
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
        title: 'Meals',
        text: `${name ? `${name}, here's` : 'Here’s'} your invite to Meals, our recipe box:`,
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

/**
 * Meals on your Home Screen (not shown once it's there). Where the browser
 * can install it, a button that does. On an iPhone, where only Share → Add
 * to Home Screen can: the steps — and, as the app there keeps a sign-in of
 * its own, a sign-in link copied for it, to paste on opening it.
 */
function HomeScreen({ userId }: { userId: string }) {
  const installPrompt = useInstallPrompt()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (isInstalled() || (!installPrompt && !isIOS())) return null

  const start = async () => {
    if (installPrompt) return void installPrompt.prompt()
    setOpen(true)
    setError(null)
    // A sign-in link for you, copied as it's made. (The clipboard is given
    // the link to come, while the tap still counts: Safari won't take a
    // copy made after waiting on the server.)
    const made = createInvite(userId)
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': made.then((l) => new Blob([l], { type: 'text/plain' })),
        }),
      ])
      setCopied(true)
    } catch {
      // (No clipboard here — or no link: show it, to copy by hand.)
      try {
        setLink(await made)
      } catch (e) {
        setError(reasonOf(e, 'Couldn’t make a sign-in link.'))
      }
    }
  }

  return (
    <section className="paper-card space-y-2 px-4 py-3">
      <h2 className="paper-serif text-[17px] font-semibold">
        Meals on your Home Screen
      </h2>
      <p className="text-sm text-muted">
        Opens full screen, like an app.
      </p>
      {!open ? (
        <PrimaryButton onClick={() => void start()}>
          {installPrompt ? 'Install Meals' : 'Add to Home Screen'}
        </PrimaryButton>
      ) : (
        <>
          <ol className="list-decimal space-y-1.5 pl-5 text-[15px]">
            <li>
              Tap Share{' '}
              <ShareIcon className="inline-block h-[18px] w-[18px] -translate-y-0.5 align-middle text-brand-ink" />{' '}
              in Safari.
            </li>
            <li>
              Choose <span className="font-semibold">Add to Home Screen</span>.
            </li>
            <li>
              Open Meals from your Home Screen and tap{' '}
              <span className="font-semibold">Paste sign-in link</span>.
            </li>
          </ol>
          {copied && (
            <p className="text-sm text-muted">
              Your sign-in link is copied, ready to paste. (One-time, good for{' '}
              {INVITE_TTL_DAYS} days.)
            </p>
          )}
          {link && <InviteLink name="" link={link} />}
          {error && <p className="text-sm text-danger">{error}</p>}
        </>
      )}
    </section>
  )
}

/** iOS's Share icon: a box, an arrow up out of it. */
function ShareIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label="Share"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16" />
      <path d="M12 14V3M8.5 6.5 12 3l3.5 3.5" />
    </svg>
  )
}
