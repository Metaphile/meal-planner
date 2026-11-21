/// <reference path="../pb_data/types.d.ts" />

// Add-ons: things the household wants that aren't from a recipe (listed
// under Add-ons on the Ingredients tab). Shared household data, stored
// generically as { key, data } like the rest; writable by whoever may edit
// the plan.
migrate(
  (app) => {
    const editPlan =
      '@request.auth.role = "admin" || @request.auth.capabilities ~ "edit_plan"'
    app.save(
      new Collection({
        type: 'base',
        name: 'addons',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: editPlan,
        updateRule: editPlan,
        deleteRule: editPlan,
        fields: [
          { name: 'key', type: 'text', required: true },
          { name: 'data', type: 'json', required: true, maxSize: 20000 },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_addons_key ON addons (key)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('addons'))
    } catch (_) {}
  },
)
