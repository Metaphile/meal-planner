import { pb } from './pb'
import { sha256Hex } from '../lib/sha256'
import type { Access } from './AuthProvider'

// The group's members, and (for writers) managing them. PocketBase's rules
// decide who may do what: writers invite people and change others' access
// (never their own), anyone changes their own name, and a server hook keeps
// at least one writer.

export interface Member {
  id: string
  name: string
  role: Access
}

function toMember(r: Record<string, unknown>): Member {
  return {
    id: String(r.id),
    name: typeof r.name === 'string' ? r.name : '',
    role: r.role === 'writer' ? 'writer' : 'reader',
  }
}

export async function listMembers(): Promise<Member[]> {
  // requestKey:null disables the SDK's auto-cancellation (otherwise a duplicate
  // call — e.g. React StrictMode's double effect — cancels the first).
  const records = await pb
    .collection('users')
    .getFullList({ sort: 'name', requestKey: null })
  return records.map((r) => toMember(r as unknown as Record<string, unknown>))
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const INVITE_TTL_DAYS = 7

/** A fresh one-time invite for a member; returns the link to share. */
export async function createInvite(userId: string): Promise<string> {
  const raw = randomHex(32)
  const tokenHash = await sha256Hex(raw)
  const expires = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000,
  ).toISOString()
  await pb.collection('invites').create({
    tokenHash,
    user: userId,
    createdBy: pb.authStore.record?.id,
    expires,
  })
  return `${location.origin}/invite#${raw}`
}

/** Add someone to the group, with an invite link to join by. */
export async function addMember(input: {
  name: string
  role: Access
}): Promise<{ member: Member; inviteLink: string }> {
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'member'
  const password = randomHex(16) // never used; members sign in by invite
  const record = await pb.collection('users').create({
    name: input.name,
    role: input.role,
    email: `${slug}-${randomHex(3)}@meal.local`,
    password,
    passwordConfirm: password,
  })
  const inviteLink = await createInvite(record.id)
  return {
    member: toMember(record as unknown as Record<string, unknown>),
    inviteLink,
  }
}

/** Another member's access (writers only; never your own). */
export async function setAccess(userId: string, role: Access): Promise<void> {
  await pb.collection('users').update(userId, { role })
}

/** A member's name (your own, or — for writers — anyone's). Updating your
 *  own also updates your session's copy. */
export async function rename(userId: string, name: string): Promise<void> {
  await pb.collection('users').update(userId, { name })
}

export async function removeMember(userId: string): Promise<void> {
  await pb.collection('users').delete(userId)
}

/** The server's reason, if it gave one. */
export function reasonOf(e: unknown, fallback: string): string {
  const err = e as { response?: { message?: string }; message?: string }
  return err?.response?.message || err?.message || fallback
}
