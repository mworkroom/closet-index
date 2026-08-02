import { describe, expect, it } from 'vitest'
import { demoData } from '../../data/demo-data'
import {
  calculateStatistics,
  selectStatisticsSnapshot,
} from './statistics-calculations'

describe('statistics calculations', () => {
  it('builds the Phase 4 statistics boundary from the current app snapshot', () => {
    const snapshot = selectStatisticsSnapshot(demoData)
    const result = calculateStatistics(snapshot)

    expect(result.summary).toEqual({
      wearLogCount: demoData.wearLogs.length,
      outfitCount: demoData.outfits.length,
      itemCount: demoData.items.length,
    })
    expect(result.outfitRows).toHaveLength(demoData.outfits.length)
    expect(result.itemRows).toHaveLength(demoData.items.length)
    expect(result.detailedCategoryCount).toBeGreaterThan(0)
  })
})
