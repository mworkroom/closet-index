import { describe, expect, it } from 'vitest'
import { demoData } from '../../data/demo-data'
import type { Item, Outfit, WearLog } from '../../lib/types'
import {
  calculateStatistics,
  getStatisticsYears,
  selectStatisticsSnapshot,
  type StatisticsSnapshot,
} from './statistics-calculations'

const baseItem = demoData.items[0]
const baseLog = demoData.wearLogs[0]

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    ...baseItem,
    image: null,
    id,
    name: id,
    category: 'Top-Knitwear',
    seasons: ['Spring'],
    acquiredOn: '2024-01-01',
    retired: false,
    ...overrides,
  }
}

function outfit(id: string, itemIds: string[]): Outfit {
  return {
    id,
    displayName: id,
    rating: null,
    itemIds,
  }
}

function log(id: string, outfitId: string, wornOn: string): WearLog {
  return {
    ...baseLog,
    id,
    outfitId,
    wornOn,
    submissionToken: id,
  }
}

function snapshot(
  items: Item[],
  outfits: Outfit[],
  wearLogs: WearLog[],
): StatisticsSnapshot {
  return {
    items,
    outfits,
    wearLogs,
    places: [],
    transportModes: [],
  }
}

describe('Phase 4 statistics calculations', () => {
  it('builds a statistics snapshot without changing the shared app data', () => {
    const selected = selectStatisticsSnapshot(demoData)

    expect(selected.items).toBe(demoData.items)
    expect(selected.outfits).toBe(demoData.outfits)
    expect(selected.wearLogs).toBe(demoData.wearLogs)
  })

  it('calculates a past-year utilization denominator and reports unknown acquisition exclusions', () => {
    const data = snapshot(
      [
        item('top-used'),
        item('made-unworn', {
          category: 'Handmade-made',
          acquiredOn: '2025-03-01',
        }),
        item('bag-used', { category: 'Bag-made' }),
        item('top-unknown', { acquiredOn: null }),
        item('innerwear', { category: 'Innerwear', acquiredOn: null }),
        item('retired-shoes', { category: 'Shoes', retired: true }),
        item('future-dress', {
          category: 'Dress',
          acquiredOn: '2027-01-01',
        }),
      ],
      [
        outfit('top-outfit', ['top-used', 'top-used']),
        outfit('bag-outfit', ['bag-used']),
        outfit('retired-outfit', ['retired-shoes']),
      ],
      [
        log('top-log-1', 'top-outfit', '2025-01-03'),
        log('top-log-2', 'top-outfit', '2025-01-03'),
        log('bag-log', 'bag-outfit', '2025-04-04'),
        log('retired-log', 'retired-outfit', '2025-05-05'),
      ],
    )

    const result = calculateStatistics(
      data,
      {
        period: { kind: 'year', year: 2025 },
        seasons: [],
        categories: [],
        excludeRetired: false,
      },
      '2026-08-03',
    )

    expect(result.summary).toEqual({
      targetItemCount: 3,
      usedItemCount: 2,
      utilizationRate: 2 / 3,
      excludedUnknownAcquiredCount: 1,
    })
    expect(result.unwornRows.map((row) => row.item.id)).toEqual([
      'made-unworn',
    ])
    expect(result.mostWornRows.map((row) => [row.item.id, row.wearCount])).toEqual([
      ['top-used', 2],
      ['retired-shoes', 1],
      ['bag-used', 1],
    ])
  })

  it('uses OR filters and de-duplicates an item that matches Bag and -made', () => {
    const data = snapshot(
      [
        item('bag-made', { category: 'Bag-made' }),
        item('other-made', { category: 'Ceramic-made' }),
        item('top', { category: 'Top-T-shirts-innerwear' }),
      ],
      [outfit('bag-outfit', ['bag-made'])],
      [log('bag-log', 'bag-outfit', '2025-02-01')],
    )

    const result = calculateStatistics(
      data,
      {
        period: { kind: 'year', year: 2025 },
        seasons: ['Spring', 'Fall'],
        categories: ['bag', 'made'],
        excludeRetired: false,
      },
      '2026-08-03',
    )

    expect(result.summary.targetItemCount).toBe(2)
    expect(result.summary.usedItemCount).toBe(1)
    expect(result.itemRows.map((row) => row.item.id)).toEqual([
      'bag-made',
      'other-made',
    ])
    expect(result.categoryRows).toEqual([
      { id: 'bag', label: 'Bag', activeCount: 1 },
      { id: 'made', label: 'Made', activeCount: 2 },
    ])
  })

  it('includes acquisition-unknown active items in Lifetime Never Worn and excludes independent Innerwear', () => {
    const data = snapshot(
      [
        item('unknown-top', {
          category: 'Top-T-shirts-innerwear',
          acquiredOn: null,
        }),
        item('unknown-innerwear', {
          category: 'Innerwear',
          acquiredOn: null,
        }),
      ],
      [],
      [],
    )

    const result = calculateStatistics(data, undefined, '2026-08-03')

    expect(result.summary.targetItemCount).toBe(1)
    expect(result.unwornRows.map((row) => row.item.id)).toEqual(['unknown-top'])
    expect(result.itemRows.map((row) => row.item.id)).not.toContain(
      'unknown-innerwear',
    )
  })

  it('Retired 제외 필터는 착용 통계와 전체 Item 목록에서 Retired Item을 제외한다', () => {
    const data = snapshot(
      [
        item('active-top'),
        item('retired-top', { retired: true }),
      ],
      [outfit('outfit', ['active-top', 'retired-top'])],
      [log('wear-log', 'outfit', '2026-05-05')],
    )

    const result = calculateStatistics(
      data,
      {
        period: { kind: 'lifetime' },
        seasons: [],
        categories: [],
        excludeRetired: true,
      },
      '2026-08-03',
    )

    expect(result.mostWornRows.map((row) => row.item.id)).toEqual([
      'active-top',
    ])
    expect(result.itemRows.map((row) => row.item.id)).toEqual(['active-top'])
  })

  it('counts every Wear Log once per item and groups lifetime wear into all 12 calendar months', () => {
    const yearRoundItem = item('year-round')
    const yearRoundOutfit = outfit('year-round-outfit', [
      'year-round',
      'year-round',
    ])
    const logs = Array.from({ length: 12 }, (_, index) =>
      log(
        `month-${index + 1}`,
        yearRoundOutfit.id,
        `${index < 6 ? 2025 : 2026}-${String(index + 1).padStart(2, '0')}-01`,
      ),
    )
    logs.push(log('extra-january', yearRoundOutfit.id, '2024-01-15'))

    const result = calculateStatistics(
      snapshot([yearRoundItem], [yearRoundOutfit], logs),
      undefined,
      '2026-12-31',
    )
    const row = result.itemRows[0]

    expect(row.wearCount).toBe(13)
    expect(row.monthlyWearCounts).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(row.wornMonthCount).toBe(12)
    expect(row.isYearRound).toBe(true)
    expect(row.firstWornOn).toBe('2024-01-15')
    expect(row.lastWornOn).toBe('2026-12-01')
  })

  it('offers only current and observed years, newest first', () => {
    const data = snapshot(
      [item('old-item', { acquiredOn: '2024-01-01' })],
      [outfit('old-outfit', ['old-item'])],
      [
        log('old-log', 'old-outfit', '2025-01-01'),
        log('future-log', 'old-outfit', '2027-01-01'),
      ],
    )

    expect(getStatisticsYears(data, '2026-08-03')).toEqual([
      2026, 2025, 2024,
    ])
  })
})
