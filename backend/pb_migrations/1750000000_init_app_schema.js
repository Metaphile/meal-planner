/// <reference path="../pb_data/types.d.ts" />

// App schema: extend the default `users` auth collection with role +
// capabilities and lock it to admins; add `invites`, `recipes`, and `plan`
// collections with server-enforced access rules.
//
// Note: when constructing a `new Collection({...})`, fields must be plain
// objects (typed field instances don't merge through the constructor in this
// PocketBase version). Superusers always bypass rules, so the invite hook
// (elevated privileges) is unaffected by the locked-down rules below.
migrate(
  (app) => {
    // --- users: invite-only, admin-managed, with role + capabilities --------
    const users = app.findCollectionByNameOrId('users')
    users.listRule = '@request.auth.id != ""' // any signed-in member
    users.viewRule = '@request.auth.id != ""'
    users.createRule = '@request.auth.role = "admin"' // only admins add people
    users.updateRule = '@request.auth.role = "admin"' // only admins edit role/caps
    users.deleteRule = '@request.auth.role = "admin"'
    users.fields.add(
      new SelectField({
        name: 'role',
        required: true,
        maxSelect: 1,
        values: ['admin', 'member'],
      }),
    )
    users.fields.add(new JSONField({ name: 'capabilities', maxSize: 5000 }))
    app.save(users)

    const usersId = users.id

    // --- invites (admin-created, single-use, expiring) ----------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'invites',
        listRule: '@request.auth.role = "admin"',
        viewRule: '@request.auth.role = "admin"',
        createRule: '@request.auth.role = "admin"',
        updateRule: '@request.auth.role = "admin"',
        deleteRule: '@request.auth.role = "admin"',
        fields: [
          { name: 'tokenHash', type: 'text', required: true },
          {
            name: 'user',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: usersId,
            cascadeDelete: true,
          },
          { name: 'createdBy', type: 'relation', maxSelect: 1, collectionId: usersId },
          { name: 'expires', type: 'date' },
          { name: 'claimedAt', type: 'date' },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_invites_tokenHash ON invites (tokenHash)'],
      }),
    )

    // --- recipes & plan (shared household data) -----------------------------
    // Stored generically as { key, data }; the domain shape lives in the app,
    // PocketBase enforces who may write. `key` is the app-level id.
    const editRecipes =
      '@request.auth.role = "admin" || @request.auth.capabilities ~ "edit_recipes"'
    app.save(
      new Collection({
        type: 'base',
        name: 'recipes',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: editRecipes,
        updateRule: editRecipes,
        deleteRule: editRecipes,
        fields: [
          { name: 'key', type: 'text', required: true },
          { name: 'data', type: 'json', required: true, maxSize: 200000 },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_recipes_key ON recipes (key)'],
      }),
    )

    const editPlan =
      '@request.auth.role = "admin" || @request.auth.capabilities ~ "edit_plan"'
    app.save(
      new Collection({
        type: 'base',
        name: 'plan',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: editPlan,
        updateRule: editPlan,
        deleteRule: editPlan,
        fields: [
          { name: 'key', type: 'text', required: true },
          { name: 'data', type: 'json', required: true, maxSize: 200000 },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_plan_key ON plan (key)'],
      }),
    )
  },
  (app) => {
    for (const name of ['plan', 'recipes', 'invites']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    const users = app.findCollectionByNameOrId('users')
    for (const f of ['role', 'capabilities']) {
      const field = users.fields.getByName(f)
      if (field) users.fields.removeByName(f)
    }
    users.createRule = ''
    app.save(users)
  },
)
