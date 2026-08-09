import { describe, expect, it } from 'vitest'
import type { CareEvent, Item, Outfit, WearLog } from '../../lib/types'
import { getCareCycleStatus, getCareRule, getLatestCareDate } from './care-cycle'

function item(category: string, retired = false): Item {
  return {
    id: 'item-1',
    name: '관리 Item',
    category,
    semanticColor: null,
    displayHex: '#222222',
    seasons: [],
    retired,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn: null,
  }
}

const outfit: Outfit = {
  id: 'outfit-1',
  displayName: null,
  rating: 'ok',
  itemIds: ['item-1'],
}

function wear(id: string, wornOn: string): WearLog {
  return {
    id,
    outfitId: outfit.id,
    wornOn,
    tempOut: null,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: null,
    feelingBack: null,
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId: null,
    transportModeId: null,
    observedHvacMode: 'off',
    observedHvacIntensity: null,
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: id,
    createdAt: `${wornOn}T00:00:00Z`,
  }
}

function care(id: string, caredOn: string, method: CareEvent['method']): CareEvent {
  return {
    id,
    itemId: 'item-1',
    caredOn,
    method,
    createdAt: `${caredOn}T00:00:00Z`,
    updatedAt: `${caredOn}T00:00:00Z`,
  }
}

describe('P6-4 care category resolver', () => {
  it.each([
    ['Bags-made', null],
    ['Top-Sweater-made', 'hand_wash'],
    ['Outer-Cardigan-made', 'hand_wash'],
    ['Outer-Cardigan', 'dry_cleaning'],
    ['Top-Knitwear', 'dry_cleaning'],
    ['Bottom-Knitwear', 'dry_cleaning'],
    ['Top-T-shirts', null],
  ])('%s Category를 우선순위대로 판정한다', (category, method) => {
    expect(getCareRule(category)?.method ?? null).toBe(method)
  })
})

describe('P6-4 care cycle', () => {
  it('관리일 당일 착용은 제외하고 다음 날부터 세어 손세탁 4/5회 경계를 지킨다', () => {
    const logs = [
      wear('same-day', '2026-08-01'),
      wear('after-1', '2026-08-02'),
      wear('after-2', '2026-08-03'),
      wear('after-3', '2026-08-04'),
      wear('after-4', '2026-08-05'),
    ]
    const input = {
      item: item('Top-Sweater-made'),
      events: [care('care-1', '2026-08-01', 'dry_cleaning')],
      outfits: [outfit],
      wearLogs: logs,
      today: '2026-08-06',
    }
    expect(getCareCycleStatus(input)).toMatchObject({
      method: 'hand_wash',
      basisDate: '2026-08-01',
      currentValue: 4,
      remaining: 1,
      due: false,
    })
    expect(
      getCareCycleStatus({ ...input, wearLogs: [...logs, wear('after-5', '2026-08-06')] }),
    ).toMatchObject({ currentValue: 5, remaining: 0, due: true })
  })

  it('관리 이력이 없으면 전체 착용을 세어 드라이클리닝 9/10회 경계를 지킨다', () => {
    const logs = Array.from({ length: 10 }, (_, index) =>
      wear(`wear-${index}`, `2026-07-${String(index + 1).padStart(2, '0')}`),
    )
    const input = {
      item: item('Top-Knitwear'),
      events: [],
      outfits: [outfit],
      wearLogs: logs.slice(0, 9),
      today: '2026-08-06',
    }
    expect(getCareCycleStatus(input)).toMatchObject({ currentValue: 9, due: false })
    expect(getCareCycleStatus({ ...input, wearLogs: logs })).toMatchObject({
      currentValue: 10,
      due: true,
    })
  })

  it('사건 당시 방식과 무관하게 가장 최근 관리일을 기준으로 하고 Retired를 제외한다', () => {
    const events = [
      care('old', '2026-06-01', 'dry_cleaning'),
      care('new', '2026-07-01', 'hand_wash'),
    ]
    expect(getLatestCareDate(events, '2026-08-06')).toBe('2026-07-01')
    expect(
      getCareCycleStatus({
        item: item('Outer-Cardigan', true),
        events,
        outfits: [outfit],
        wearLogs: [wear('after', '2026-07-02')],
        today: '2026-08-06',
      }),
    ).toBeNull()
  })
})
