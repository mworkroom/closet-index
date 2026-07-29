import { describe, expect, it } from 'vitest'
import { inspectAlphaBounds } from './item-image'

function pixels(width: number, height: number, alphas: number[]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < alphas.length; index += 1) {
    data[index * 4 + 3] = alphas[index]
  }
  return data
}

describe('item image alpha inspection', () => {
  it('finds the visible Item bounds and detects a transparent background', () => {
    expect(
      inspectAlphaBounds(
        pixels(3, 3, [
          0, 0, 0,
          0, 255, 200,
          0, 0, 0,
        ]),
        3,
        3,
      ),
    ).toEqual({
      left: 1,
      top: 1,
      right: 2,
      bottom: 1,
      hasTransparentPixel: true,
    })
  })

  it('rejects a file that contains no visible pixels', () => {
    expect(inspectAlphaBounds(pixels(2, 2, [0, 5, 10, 0]), 2, 2)).toBeNull()
  })

  it('distinguishes an opaque background from a transparent cutout', () => {
    expect(
      inspectAlphaBounds(pixels(2, 1, [255, 255]), 2, 1),
    ).toMatchObject({ hasTransparentPixel: false })
  })
})
