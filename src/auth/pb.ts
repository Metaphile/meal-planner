import PocketBase from 'pocketbase'

// In dev, VITE_PB_URL points at the containerized PocketBase. In production the
// PWA is served by PocketBase itself (pb_public), so the API is same-origin.
export const PB_URL = import.meta.env.VITE_PB_URL || '/'

export const pb = new PocketBase(PB_URL)
