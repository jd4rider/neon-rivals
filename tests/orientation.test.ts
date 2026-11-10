import { describe, expect, it } from 'vitest'
import { isCoarsePointer, shouldBlockLandscape } from '../src/core/orientation'

describe('landscape gate rules', () => {
  it('blocks a touch phone held upright', () => {
    expect(shouldBlockLandscape({ width: 390, height: 844 }, true)).toBe(true)
    expect(shouldBlockLandscape({ width: 360, height: 780 }, true)).toBe(true)
    expect(shouldBlockLandscape({ width: 768, height: 1024 }, true)).toBe(true)
  })

  it('allows a touch device held sideways', () => {
    expect(shouldBlockLandscape({ width: 844, height: 390 }, true)).toBe(false)
    expect(shouldBlockLandscape({ width: 780, height: 360 }, true)).toBe(false)
    expect(shouldBlockLandscape({ width: 1180, height: 820 }, true)).toBe(false)
  })

  it('never forces rotation on a mouse device', () => {
    expect(shouldBlockLandscape({ width: 420, height: 900 }, false)).toBe(false)
    expect(shouldBlockLandscape({ width: 1280, height: 720 }, false)).toBe(false)
  })

  it('treats a square viewport as playable', () => {
    expect(shouldBlockLandscape({ width: 600, height: 600 }, true)).toBe(false)
  })

  it('ignores nonsense viewport values instead of locking the player out', () => {
    expect(shouldBlockLandscape({ width: 0, height: 0 }, true)).toBe(false)
    expect(shouldBlockLandscape({ width: Number.NaN, height: 700 }, true)).toBe(false)
    expect(shouldBlockLandscape({ width: 700, height: -10 }, true)).toBe(false)
  })
})

describe('pointer detection', () => {
  it('reads the coarse-pointer media query safely', () => {
    const coarse = {
      matchMedia: () => ({ matches: true }),
    } as unknown as Window
    const fine = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window
    const broken = {
      matchMedia: () => {
        throw new Error('unsupported')
      },
    } as unknown as Window

    expect(isCoarsePointer(coarse)).toBe(true)
    expect(isCoarsePointer(fine)).toBe(false)
    expect(isCoarsePointer(broken)).toBe(false)
  })
})
