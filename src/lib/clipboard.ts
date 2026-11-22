/**
 * Copy text: the Clipboard API where the page has it — only on HTTPS (or
 * localhost) — and otherwise the old way, selecting it in a hidden field.
 * (Called from a tap, as both need.)
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // (Refused: try the old way.)
    }
  }
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true // (no keyboard on iOS)
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  document.body.appendChild(field)
  try {
    field.select()
    field.setSelectionRange(0, text.length) // (iOS)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}
