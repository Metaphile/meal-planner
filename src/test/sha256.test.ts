import { describe, expect, it } from 'vitest'
import { sha256 } from '../lib/sha256'

const hex = (b: Uint8Array) =>
  [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

describe('sha256 (without Web Crypto)', () => {
  it('matches the standard test vectors', () => {
    const enc = new TextEncoder()
    expect(hex(sha256(enc.encode('')))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(hex(sha256(enc.encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(
      hex(
        sha256(
          enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
        ),
      ),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
  })

  it('matches Web Crypto for every length across block edges', async () => {
    for (let n = 0; n < 200; n++) {
      const data = crypto.getRandomValues(new Uint8Array(n))
      const want = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
      expect(hex(sha256(data))).toBe(hex(want))
    }
  })
})
