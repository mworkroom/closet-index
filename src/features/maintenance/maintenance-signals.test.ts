import { describe, expect, it } from 'vitest'
import type { Item } from '../../lib/types'
import { getMaintenanceSignals } from './maintenance-signals'

const item: Item = {
  id: 'item-1',
  name: '겹치는 Item',
  category: 'Socks',
  semanticColor: null,
  displayHex: '#222222',
  seasons: [],
  retired: false,
  rainOk: true,
  longWalkOk: true,
  memo: null,
  acquiredOn: null,
}

describe('P6-4 maintenance signals', () => {
  it('목록 배지는 점검을 교체보다 우선하고 상세 배지는 둘 다 보존한다', () => {
    const outfits = [{ id: 'outfit-1', displayName: null, rating: 'ok' as const, itemIds: [item.id] }]
    const wearLogs = Array.from({ length: 30 }, (_, index) => ({
      id: `log-${index}`,
      outfitId: 'outfit-1',
      wornOn: '2024-08-01',
      tempOut: null,
      tempBack: null,
      tempBackInferred: false,
      feelingOut: null,
      feelingBack: null,
      rainCondition: 'unknown' as const,
      longWalkCondition: 'unknown' as const,
      placeId: null,
      transportModeId: null,
      memo: null,
      temperatureSource: 'manual' as const,
      weatherLocationId: null,
      weatherIssuedAt: null,
      weatherOverridden: false,
      submissionToken: `token-${index}`,
      createdAt: '2024-08-01T00:00:00Z',
    }))
    const signal = getMaintenanceSignals({
      items: [item],
      outfits,
      wearLogs,
      purchaseEvents: [],
      careEvents: [],
      today: '2026-08-06',
    }).get(item.id)

    expect(signal?.primaryBadge).toBe('점검')
    expect(signal?.allBadges).toEqual(['점검', '교체'])
  })

  it('3년 이상 미착용은 점검 대신 정리 후보 배지를 사용한다', () => {
    const signal = getMaintenanceSignals({
      items: [{ ...item, category: 'Top-T-shirts' }],
      outfits: [{ id: 'outfit-1', displayName: null, rating: 'ok', itemIds: [item.id] }],
      wearLogs: [{
        id: 'old-log',
        outfitId: 'outfit-1',
        wornOn: '2023-08-06',
        tempOut: null,
        tempBack: null,
        tempBackInferred: false,
        feelingOut: null,
        feelingBack: null,
        rainCondition: 'unknown',
        longWalkCondition: 'unknown',
        placeId: null,
        transportModeId: null,
        memo: null,
        temperatureSource: 'manual',
        weatherLocationId: null,
        weatherIssuedAt: null,
        weatherOverridden: false,
        submissionToken: 'old-token',
        createdAt: '2023-08-06T00:00:00Z',
      }],
      purchaseEvents: [],
      careEvents: [],
      today: '2026-08-06',
    }).get(item.id)

    expect(signal?.inspection).toBeNull()
    expect(signal?.declutter?.label).toBe('정리 후보')
    expect(signal?.primaryBadge).toBe('정리 후보')
    expect(signal?.allBadges).toEqual(['정리 후보'])
  })

  it('사건 조회 실패는 빈 이력으로 계산하지 않는다', () => {
    const signal = getMaintenanceSignals({
      items: [item],
      outfits: [],
      wearLogs: [],
      purchaseEvents: [],
      careEvents: [],
      today: '2026-08-06',
      purchaseEventsAvailable: false,
      careEventsAvailable: false,
    }).get(item.id)
    expect(signal?.replacement).toBeNull()
    expect(signal?.care).toBeNull()
  })
})
