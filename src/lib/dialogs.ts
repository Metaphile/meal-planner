import { useCallback, useState } from 'react'
import { DAY, load, save, type Slice } from './uiState'

/**
 * The dialog that's open (asking "Discard changes?", "Remove …?"), kept on
 * the device like the rest of what's on screen: the app opened again (iOS
 * having discarded it, or a new version put in place), it's still asking.
 * Named by what it's about (e.g. `card:delete:<recipe id>`), so it only
 * comes back where it was.
 */
const DIALOG: Slice<string> = {
  key: 'dialog',
  version: 1,
  maxAgeMs: DAY,
  parse: (x) => (typeof x === 'string' ? x : null),
}

/** The dialog left open, if any. */
export const keptDialog = () => load(DIALOG)

/** Keep `id` as the dialog that's open (null: none is). */
export const keepDialog = (id: string | null) => save(DIALOG, id)

/** Forget `id` as the dialog open (if it's the one kept). */
export const forgetDialog = (id: string) => {
  if (load(DIALOG) === id) save(DIALOG, null)
}

/**
 * A dialog's open/closed, kept on the device. `id` names it (null: not
 * kept); `restore`: open again if it was left open (only where its owner is
 * itself being taken up as it was left, so it can't turn up somewhere it
 * wasn't).
 */
export function useKeptDialog(
  id: string | null,
  restore = true,
): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(
    () => id !== null && restore && load(DIALOG) === id,
  )
  const set = useCallback(
    (o: boolean) => {
      setOpen(o)
      if (id === null) return
      if (o) keepDialog(id)
      else forgetDialog(id)
    },
    [id],
  )
  return [open, set]
}
