/** Short, collision-resistant id. Uses crypto.randomUUID when available. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'id-' + Math.abs(hashTime()).toString(36)
}

// Fallback only (non-secure contexts / very old engines).
let counter = 0
function hashTime(): number {
  counter += 1
  return (performance.now() * 1000 + counter) | 0
}
