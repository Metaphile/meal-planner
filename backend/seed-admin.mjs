// Bootstraps the FIRST admin (resolves the invite chicken-and-egg).
// Run once by the Pi operator, who holds the PocketBase superuser creds:
//
//   PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
//   APP_URL=https://meals.example.com node backend/seed-admin.mjs "Adam"
//
// It creates an admin user with all capabilities, mints a one-time invite, and
// prints the invite link to open on your device. Refuses to run if an admin
// already exists — after that, onboard everyone from the in-app Admin screen.
import PocketBase from 'pocketbase'
import crypto from 'node:crypto'

const PB_URL = process.env.PB_URL || 'http://localhost:8090'
const SU_EMAIL = process.env.PB_SUPERUSER_EMAIL || 'admin@example.com'
const SU_PASS = process.env.PB_SUPERUSER_PASSWORD || 'devpassword123'
const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const name = process.argv[2] || 'Admin'

const ALL_CAPABILITIES = ['edit_recipes', 'edit_plan']

const pb = new PocketBase(PB_URL)
await pb.collection('_superusers').authWithPassword(SU_EMAIL, SU_PASS)

const existing = await pb
  .collection('users')
  .getList(1, 1, { filter: 'role = "admin"' })
if (existing.totalItems > 0) {
  console.error(
    'An admin already exists — refusing to seed another. Use the in-app Admin screen.',
  )
  process.exit(1)
}

const slug =
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'admin'
const email = `${slug}-${crypto.randomBytes(3).toString('hex')}@meal.local`
const password = crypto.randomBytes(24).toString('hex') // never used; members sign in via invite

const user = await pb.collection('users').create({
  name,
  role: 'admin',
  capabilities: ALL_CAPABILITIES,
  email,
  password,
  passwordConfirm: password,
  verified: true,
  emailVisibility: false,
})

const rawToken = crypto.randomBytes(32).toString('hex')
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
await pb.collection('invites').create({
  tokenHash,
  user: user.id,
  createdBy: user.id,
  expires,
})

console.log(`\n✅ First admin created: ${name}`)
console.log('Open this link once on your device to sign in (valid 7 days):\n')
console.log(`${APP_URL}/invite#${rawToken}\n`)
