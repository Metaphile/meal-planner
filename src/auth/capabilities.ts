// Capability checklist. Keep in sync with the PocketBase API rules
// (backend/pb_migrations) — the server is the real enforcer; these drive the
// admin UI and client-side affordance gating.
export const CAPABILITIES = [
  { key: 'edit_recipes', label: 'Edit recipes' },
  { key: 'edit_plan', label: 'Edit the meal plan' },
] as const

export type Capability = (typeof CAPABILITIES)[number]['key']
