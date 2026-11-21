/// <reference path="../pb_data/types.d.ts" />

// Anyone may make a sign-in link for themselves (to sign in the app on their
// Home Screen, or another device): it signs in only as them. Invites for
// anyone else are still writers' alone.
migrate(
  (app) => {
    const invites = app.findCollectionByNameOrId('invites')
    invites.createRule =
      '@request.auth.role = "writer" || (@request.auth.id != "" && @request.body.user = @request.auth.id && @request.body.createdBy = @request.auth.id)'
    invites.viewRule = '@request.auth.role = "writer" || user = @request.auth.id'
    app.save(invites)
  },
  (app) => {
    const invites = app.findCollectionByNameOrId('invites')
    invites.createRule = '@request.auth.role = "writer"'
    invites.viewRule = '@request.auth.role = "writer"'
    app.save(invites)
  },
)
