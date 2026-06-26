/// <reference path="../pb_data/types.d.ts" />

// Public endpoint that turns a one-time invite token into an auth session.
// Runs with elevated (app-level) privileges, so it bypasses the admin-only
// rules on the `invites`/`users` collections. The token is never stored — only
// its SHA-256 hash is — so a DB leak can't be replayed into sessions.
routerAdd('POST', '/api/invite/accept', (e) => {
  const body = e.requestInfo().body || {}
  const raw = String(body.token || '').trim()
  if (!raw) throw new BadRequestError('Missing invite token.')

  const hash = $security.sha256(raw)

  let invite
  try {
    invite = $app.findFirstRecordByFilter('invites', 'tokenHash = {:h}', {
      h: hash,
    })
  } catch (_) {
    throw new BadRequestError('Invalid invite link.')
  }

  // Note: empty date fields return a non-null (zero) DateTime object that is
  // truthy in JS, so check the string value, which is "" when unset.
  if (invite.getString('claimedAt')) {
    throw new BadRequestError('This invite has already been used.')
  }
  const expires = invite.getString('expires')
  if (expires && new Date(expires) < new Date()) {
    throw new BadRequestError('This invite link has expired.')
  }

  const user = $app.findRecordById('users', invite.get('user'))

  invite.set('claimedAt', new Date().toISOString())
  $app.save(invite)

  // Mint a normal auth token for the user — the client stores it like any
  // other PocketBase session (persistent + refreshable).
  const token = user.newAuthToken()
  return e.json(200, {
    token,
    record: {
      id: user.id,
      collectionId: user.collection().id,
      collectionName: 'users',
      name: user.get('name'),
      role: user.get('role'),
      capabilities: user.get('capabilities') || [],
      email: user.get('email'),
    },
  })
})
