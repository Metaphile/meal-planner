/// <reference path="../pb_data/types.d.ts" />

// Two access levels replace admin/member + capabilities:
//  - writer: changes recipes, wants, add-ons and haves; invites people and
//    changes other members' access (never their own).
//  - reader: looks, and edits their own name.
// Everyone keeps favorites of their own (a new `favorites` collection).
// Existing users: admins become writers, as do members who could edit
// anything; other members become readers. (A server hook keeps at least one
// writer — see pb_hooks/group.pb.js.)
const WRITER = '@request.auth.role = "writer"'
// Changes nobody may make through the API to an account: its email or
// password (sign-in is by invite).
const NO_CREDENTIALS =
  '@request.body.email:isset = false && @request.body.password:isset = false'

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const role = users.fields.getByName('role')
    role.values = ['admin', 'member', 'writer', 'reader']
    app.save(users)

    const all = app.findAllRecords('users')
    let writers = 0
    for (const u of all) {
      const wasAdmin = u.getString('role') === 'admin'
      const couldEdit = u.getString('capabilities').includes('edit')
      const writer = wasAdmin || couldEdit
      if (writer) writers++
      u.set('role', writer ? 'writer' : 'reader')
      app.save(u)
    }
    // (Never no writer at all.)
    if (writers === 0 && all.length > 0) {
      all[0].set('role', 'writer')
      app.save(all[0])
    }

    role.values = ['writer', 'reader']
    users.fields.removeByName('capabilities')
    users.listRule = '@request.auth.id != ""'
    users.viewRule = '@request.auth.id != ""'
    users.createRule = WRITER
    // Writers change others (their name or access); anyone changes their own
    // name — never their own access. Nobody changes credentials.
    users.updateRule =
      `((${WRITER} && id != @request.auth.id) || ` +
      `(id = @request.auth.id && @request.body.role:isset = false)) && ` +
      NO_CREDENTIALS
    users.deleteRule = `${WRITER} && id != @request.auth.id`
    app.save(users)

    const invites = app.findCollectionByNameOrId('invites')
    invites.listRule = WRITER
    invites.viewRule = WRITER
    invites.createRule = WRITER
    invites.updateRule = WRITER
    invites.deleteRule = WRITER
    app.save(invites)

    for (const name of ['recipes', 'plan', 'wants', 'addons', 'haves']) {
      const c = app.findCollectionByNameOrId(name)
      c.createRule = WRITER
      c.updateRule = WRITER
      c.deleteRule = WRITER
      app.save(c)
    }

    // Favorites: each person's own (seen and changed by them alone).
    app.save(
      new Collection({
        type: 'base',
        name: 'favorites',
        listRule: 'user = @request.auth.id',
        viewRule: 'user = @request.auth.id',
        createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
        updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
        deleteRule: 'user = @request.auth.id',
        fields: [
          { name: 'key', type: 'text', required: true },
          {
            name: 'user',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'data', type: 'json', required: true, maxSize: 2000 },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_favorites_key ON favorites (key)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('favorites'))
    } catch (_) {}
    const users = app.findCollectionByNameOrId('users')
    const role = users.fields.getByName('role')
    role.values = ['admin', 'member', 'writer', 'reader']
    users.fields.add(new JSONField({ name: 'capabilities', maxSize: 5000 }))
    app.save(users)
    for (const u of app.findAllRecords('users')) {
      const writer = u.getString('role') === 'writer'
      u.set('role', writer ? 'admin' : 'member')
      app.save(u)
    }
    role.values = ['admin', 'member']
    users.updateRule = '@request.auth.role = "admin"'
    users.createRule = '@request.auth.role = "admin"'
    users.deleteRule = '@request.auth.role = "admin"'
    app.save(users)
    const admin = '@request.auth.role = "admin"'
    const invites = app.findCollectionByNameOrId('invites')
    invites.listRule = invites.viewRule = invites.createRule = admin
    invites.updateRule = invites.deleteRule = admin
    app.save(invites)
    const edit = (cap) => `${admin} || @request.auth.capabilities ~ "${cap}"`
    for (const [name, cap] of [
      ['recipes', 'edit_recipes'],
      ['plan', 'edit_plan'],
      ['wants', 'edit_plan'],
      ['addons', 'edit_plan'],
      ['haves', 'edit_plan'],
    ]) {
      const c = app.findCollectionByNameOrId(name)
      c.createRule = c.updateRule = c.deleteRule = edit(cap)
      app.save(c)
    }
  },
)
