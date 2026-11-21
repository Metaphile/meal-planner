// Bootstraps the FIRST writer (resolves the invite chicken-and-egg). Run once by
// the operator, who holds the PocketBase superuser creds. Dependency-free (uses
// global fetch) so it runs in a bare Node container with no npm install.
//
// On the Pi, run it on the Docker network so it reaches PocketBase directly
// (NAT loopback usually blocks hitting your own public URL from the LAN):
//   docker compose --profile seed run --rm \
//     -e PB_SUPERUSER_EMAIL=you@example.com -e PB_SUPERUSER_PASSWORD=... \
//     -e ADMIN_NAME="Adam" seed-admin
//
// It creates a writer (who can then invite everyone else from the Account
// tab), mints a one-time invite, and prints the invite link. Refuses to run if
// a writer already exists.
import crypto from 'node:crypto'

const PB_URL = (process.env.PB_URL || 'http://localhost:8090').replace(/\/$/, '')
const SU_EMAIL = process.env.PB_SUPERUSER_EMAIL || 'admin@example.com'
const SU_PASS = process.env.PB_SUPERUSER_PASSWORD || 'devpassword123'
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
const name = process.argv[2] || process.env.ADMIN_NAME || 'Admin'

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`)
  }
  return data
}

const auth = await api('/api/collections/_superusers/auth-with-password', {
  method: 'POST',
  body: { identity: SU_EMAIL, password: SU_PASS },
})
const token = auth.token

const existing = await api(
  `/api/collections/users/records?perPage=1&filter=${encodeURIComponent('role="writer"')}`,
  { token },
)
if (existing.totalItems > 0) {
  console.error(
    'A writer already exists — refusing to seed another. Invite people from the Account tab.',
  )
  process.exit(1)
}

const slug =
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'writer'
const password = crypto.randomBytes(24).toString('hex') // never used; invite-based sign-in

const user = await api('/api/collections/users/records', {
  method: 'POST',
  token,
  body: {
    name,
    role: 'writer',
    email: `${slug}-${crypto.randomBytes(3).toString('hex')}@meal.local`,
    password,
    passwordConfirm: password,
  },
})

const rawToken = crypto.randomBytes(32).toString('hex')
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
await api('/api/collections/invites/records', {
  method: 'POST',
  token,
  body: { tokenHash, user: user.id, createdBy: user.id, expires },
})

console.log(`\n✅ First writer created: ${name}`)
console.log('Open this link once on your device to sign in (valid 7 days):\n')
console.log(`${APP_URL}/invite#${rawToken}\n`)
