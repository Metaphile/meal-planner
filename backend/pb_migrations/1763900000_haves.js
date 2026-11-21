/// <reference path="../pb_data/types.d.ts" />

// Haves: ingredients the household has on hand (ticked on the Ingredients
// tab), and how much. Shared household data, stored generically as
// { key, data } like the rest; writable by whoever may edit the plan.
migrate(
  (app) => {
    const editPlan =
      '@request.auth.role = "admin" || @request.auth.capabilities ~ "edit_plan"'
    app.save(
      new Collection({
        type: 'base',
        name: 'haves',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: editPlan,
        updateRule: editPlan,
        deleteRule: editPlan,
        fields: [
          { name: 'key', type: 'text', required: true },
          { name: 'data', type: 'json', required: true, maxSize: 20000 },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_haves_key ON haves (key)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('haves'))
    } catch (_) {}
  },
)
