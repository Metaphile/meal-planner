/** A piece of written text: words, or a web address in them (`href`: where
 *  it goes — one written without its scheme, "www.…", goes to https). */
export type Piece = { text: string; href?: string }

// An address: from "http(s)://" or "www." to the next space. (What ends it
// is trimmed after: see `trimEnd`.)
const ADDRESS = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi

/**
 * Where an address written in a sentence really ends: not on the full stop,
 * comma or the like after it ("see example.com/pie."), nor on a closing
 * bracket or quote it's written in ("(example.com/pie)") — unless the
 * address opened it itself ("…/Pie_(dish)").
 */
function trimEnd(url: string) {
  for (;;) {
    const last = url.at(-1)
    if (last && '.,;:!?\'"’”'.includes(last)) url = url.slice(0, -1)
    else if (last === ')' && count(url, '(') < count(url, ')'))
      url = url.slice(0, -1)
    else if (last === ']' && count(url, '[') < count(url, ']'))
      url = url.slice(0, -1)
    else return url
  }
}
const count = (s: string, c: string) => s.split(c).length - 1

/** Text split into its words and the web addresses in them, in order:
 *  every character in one piece or another. */
export function splitLinks(text: string): Piece[] {
  const pieces: Piece[] = []
  let at = 0
  for (const m of text.matchAll(ADDRESS)) {
    const url = trimEnd(m[0])
    // ("www." alone, or "http://" with nothing after it: not an address.)
    if (!/^(?:https?:\/\/|www\.)[^./]/i.test(url)) continue
    if (m.index > at) pieces.push({ text: text.slice(at, m.index) })
    pieces.push({
      text: url,
      href: /^www\./i.test(url) ? `https://${url}` : url,
    })
    at = m.index + url.length
  }
  if (at < text.length) pieces.push({ text: text.slice(at) })
  return pieces
}
