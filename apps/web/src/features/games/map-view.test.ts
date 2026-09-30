import { describe, expect, it } from 'vitest'

import { clampView, fitView, scaleLimits, zoomView } from './map-view'

const picture = { width: 4000, height: 2000 }
const box = { width: 1000, height: 800 }

describe('fitView', () => {
  it('shows the whole picture, centered', () => {
    const view = fitView(picture, box)
    expect(view.scale).toBeCloseTo(0.2375)
    expect(view.x).toBeCloseTo(25)
    expect(view.y).toBeCloseTo(400 - (2000 * 0.2375) / 2)
  })
})

describe('zoomView', () => {
  it('keeps the point under the pointer in place', () => {
    const start = fitView(picture, box)
    const zoomed = zoomView(start, 2, 300, 200, picture, box)
    expect(zoomed.scale).toBeCloseTo(start.scale * 2)
    // The picture point under (300, 200) is still under it.
    const before = { x: (300 - start.x) / start.scale, y: (200 - start.y) / start.scale }
    const after = { x: (300 - zoomed.x) / zoomed.scale, y: (200 - zoomed.y) / zoomed.scale }
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('stops at sensible limits', () => {
    const start = fitView(picture, box)
    const { min, max } = scaleLimits(picture, box)
    expect(zoomView(start, 1000, 500, 400, picture, box).scale).toBe(max)
    expect(zoomView(start, 0.001, 500, 400, picture, box).scale).toBe(min)
  })

  it('lets small pictures grow beyond their pixels', () => {
    expect(scaleLimits({ width: 100, height: 100 }, box).max).toBeGreaterThan(100)
    expect(scaleLimits(picture, box).max).toBeGreaterThanOrEqual(2)
  })
})

describe('clampView', () => {
  it('keeps the middle of the box on the picture', () => {
    const view = { scale: 1, x: 5000, y: -9000 }
    const clamped = clampView(view, picture, box)
    expect(clamped).toEqual({ scale: 1, x: 500, y: 400 - 2000 })
  })

  it('leaves views that show the picture alone', () => {
    const view = fitView(picture, box)
    expect(clampView(view, picture, box)).toEqual(view)
  })
})
