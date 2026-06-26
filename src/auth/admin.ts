import { pb } from './pb'
import type { Capability } from './capabilities'

// Admin-only helpers for managing family members + invites. All of these run
// with the admin's token; PocketBase rules enforce that only admins succeed.

export interface FamilyUser {
  id: string
  name: string
  role: 'admin' | 'member'
  capabilities: string[]
}

function toFamilyUser(r: Record<string, unknown>): FamilyUser {
  return {
    id: String(r.id),
    name: typeof r.name === 'string' ? r.name : '',
    role: r.role === 'admin' ? 'admin' : 'member',
    capabilities: Array.isArray(r.capabilities) ? (r.capabilities as string[]) : [],
  }
}

export async function listUsers(): Promise<FamilyUser[]> {
  // requestKey:null disables the SDK's auto-cancellation (otherwise a duplicate
  // call — e.g. React StrictMode's double effect — cancels the first).
  const records = await pb
    .collection('users')
    .getFullList({ sort: 'name', requestKey: null })
  return records.map((r) => toFamilyUser(r as unknown as Record<string, unknown>))
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const INVITE_TTL_DAYS = 7

/** Create a fresh invite for a user and return the shareable link. */
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

/** Create a new family member and an invite link to onboard them. */
export async function createMember(input: {
  name: string
  role: 'admin' | 'member'
  capabilities: Capability[]
}): Promise<{ user: FamilyUser; inviteLink: string }> {
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'member'
  const password = randomHex(16) // never used; members sign in via invite
  const record = await pb.collection('users').create({
    name: input.name,
    role: input.role,
    capabilities: input.capabilities,
    email: `${slug}-${randomHex(3)}@meal.local`,
    password,
    passwordConfirm: password,
  })
  const inviteLink = await createInvite(record.id)
  return {
    user: toFamilyUser(record as unknown as Record<string, unknown>),
    inviteLink,
  }
}

export async function setRole(
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await pb.collection('users').update(userId, { role })
}

export async function setCapabilities(
  userId: string,
  capabilities: Capability[],
): Promise<void> {
  await pb.collection('users').update(userId, { capabilities })
}

export async function removeUser(userId: string): Promise<void> {
  await pb.collection('users').delete(userId)
}
