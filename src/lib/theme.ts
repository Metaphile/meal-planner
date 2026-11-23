/**
 * The app's theme: its colours (see "Themes" in index.css), chosen on the
 * Account page and kept on this device. Put in place before the app draws
 * (an inline script in index.html does it first, so it opens in its theme,
 * not the default for a moment), and on the root as data-theme.
 */

export type ThemeId = 'lavender' | 'sage' | 'rose' | 'kraft' | 'night'

export interface Theme {
  id: ThemeId
  name: string
  /** For its sample on the Account page (the theme's own colours, whichever
   *  theme is showing). */
  sample: { counter: string; paper: string; accent: string; edge: string; ink: string }
}

export const THEMES: Theme[] = [
  {
    id: 'lavender',
    name: 'Lavender',
    sample: { counter: '#dfe8e3', paper: '#fcf9f1', accent: '#c3bbd5', edge: '#978ab7', ink: '#3a3428' },
  },
  {
    id: 'sage',
    name: 'Sage',
    sample: { counter: '#eee3e0', paper: '#fcf9f1', accent: '#aec8b2', edge: '#6d9b76', ink: '#3a3428' },
  },
  {
    id: 'rose',
    name: 'Rose',
    sample: { counter: '#dee7ec', paper: '#fcf9f1', accent: '#dab5ba', edge: '#bc7f88', ink: '#3a3428' },
  },
  {
    id: 'kraft',
    name: 'Kraft',
    sample: { counter: '#3c291d', paper: '#fcf9f1', accent: '#d6ba86', edge: '#a67e44', ink: '#3a3428' },
  },
  {
    id: 'night',
    name: 'Night',
    sample: { counter: '#19201c', paper: '#2d2a24', accent: '#5f5378', edge: '#8c7cad', ink: '#eae4d7' },
  },
]

const KEY = 'meals.theme'

/** The theme chosen on this device (the default, if none). */
export function savedTheme(): ThemeId {
  try {
    const id = localStorage.getItem(KEY)
    if (THEMES.some((t) => t.id === id)) return id as ThemeId
  } catch {
    // (No storage: the default.)
  }
  return 'lavender'
}

/** Show the app in `id`'s colours (and remember it, if `keep`). */
export function applyTheme(id: ThemeId, keep = false): void {
  const root = document.documentElement
  if (id === 'lavender') delete root.dataset.theme
  else root.dataset.theme = id
  if (keep) {
    try {
      localStorage.setItem(KEY, id)
    } catch {
      // (Not kept: it still shows, till the app's closed.)
    }
  }
  // The browser's own colour round the page (Safari's toolbar, the status
  // bar's backing): the counter's.
  const counter = getComputedStyle(root).getPropertyValue('--color-counter').trim()
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', counter || '#dfe8e3')
}
