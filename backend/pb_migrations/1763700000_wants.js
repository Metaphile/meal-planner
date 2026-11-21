/// <reference path="../pb_data/types.d.ts" />

// Wants: the recipes the household wants to make, and how many times each
// (their ingredients make up the Ingredients list). Shared household data,
// stored generically as { key, data } like recipes and plan; writable by
// whoever may edit the plan.
migrate(
  (app) => {
    const editPlan =
      '@request.auth.role = "admin" || @request.auth.capabilities ~ "edit_plan"'
    app.save(
      new Collection({
        type: 'base',
        name: 'wants',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: editPlan,
        updateRule: editPlan,
        deleteRule: editPlan,
        fields: [
          { name: 'key', type: 'text', required: true },
          { name: 'data', type: 'json', required: true, maxSize: 20000 },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_wants_key ON wants (key)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('wants'))
    } catch (_) {}
  },
)
