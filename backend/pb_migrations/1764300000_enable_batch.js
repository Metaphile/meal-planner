/// <reference path="../pb_data/types.d.ts" />

// The batch API, on: the app sends its queued writes together — one request,
// applied all or nothing (clearing the shopping list's ticked lines is a
// single change, not one per line). (Each write in a batch still answers to
// its collection's API rules.)
migrate(
  (app) => {
    const settings = app.settings()
    settings.batch.enabled = true
    settings.batch.maxRequests = 50 // the app splits bigger queues
    settings.batch.timeout = 5 // seconds
    app.save(settings)
  },
  (app) => {
    const settings = app.settings()
    settings.batch.enabled = false
    app.save(settings)
  },
)
