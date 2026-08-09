import { describe, expect, it } from 'vitest'
import type { Item, Outfit, PurchaseEvent, WearLog } from '../../lib/types'
import {
  getElapsedCalendarDays,
  getPurchaseCycleBasisDate,
  getPurchaseCycleStatus,
  getPurchaseReplacementRule,
} from './purchase-replenishment'

function item(category: string, options: Partial<Item> = {}): Item {
  return {
    id: 'item',
    name: 'Item',
    category,
    semanticColor: null,
    displayHex: '#222222',
    seasons: [],
    retired: false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn: '2024-01-01',
    currentQuantity: null,
    ...options,
  }
}

function event(id: string, purchasedOn: string): PurchaseEvent {
  return {
    id,
    itemId: 'item',
    purchasedOn,
    quantity: 1,
    createdAt: `${purchasedOn}T00:00:00Z`,
    updatedAt: `${purchasedOn}T00:00:00Z`,
  }
}

function wearLog(id: string, wornOn: string): WearLog {
  return {
    id,
    outfitId: 'outfit',
    wornOn,
    tempOut: null,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: null,
    feelingBack: null,
    rainCondition: 'unknown',
    longWalkCondition: 'unknown',
    placeId: null,
    transportModeId: null,
    observedHvacMode: 'off',
    observedHvacIntensity: null,
    memo: null,
    temperatureSource: 'notion',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: id,
    createdAt: `${wornOn}T00:00:00Z`,
  }
}

const outfits: Outfit[] = [
  {
    id: 'outfit',
    displayName: null,
    rating: 'ok',
    itemIds: ['item'],
  },
]

describe('purchase replenishment calculation', () => {
  it('resolves one canonical replacement rule without Innerwear overlap', () => {
    expect(getPurchaseReplacementRule(' Top-T-shirts-innerwear ')).toEqual({
      category: 'Top-T-shirts-innerwear',
      metric: 'wear_count',
      threshold: 60,
    })
    expect(getPurchaseReplacementRule('SOCKS')?.threshold).toBe(30)
    expect(getPurchaseReplacementRule('Innerwear')?.metric).toBe('elapsed_days')
    expect(getPurchaseReplacementRule('Top-T-shirts')).toBeNull()
  })

  it('uses the newest initial or repurchase date as the current cycle basis', () => {
    expect(
      getPurchaseCycleBasisDate(
        item('Socks'),
        [event('old', '2025-01-01'), event('new', '2026-02-01')],
        '2026-08-06',
      ),
    ).toBe('2026-02-01')
  })

  it('counts same-day wear and reaches the 60-wear boundary', () => {
    const logs = Array.from({ length: 60 }, (_, index) =>
      wearLog(`log-${index}`, index === 0 ? '2026-01-01' : '2026-01-02'),
    )
    const status = getPurchaseCycleStatus({
      item: item('Top-T-shirts-innerwear'),
      events: [event('purchase', '2026-01-01')],
      outfits,
      wearLogs: logs,
      today: '2026-08-06',
    })

    expect(status).toMatchObject({
      basisDate: '2026-01-01',
      currentValue: 60,
      remaining: 0,
      due: true,
    })
  })

  it('counts all wear without a basis and reaches the Socks 29/30 boundary', () => {
    const logs = Array.from({ length: 30 }, (_, index) =>
      wearLog(`log-${index}`, '2026-01-01'),
    )
    const base = {
      item: item('Socks', { acquiredOn: null }),
      events: [],
      outfits,
      today: '2026-08-06',
    }
    expect(
      getPurchaseCycleStatus({ ...base, wearLogs: logs.slice(0, 29) })?.due,
    ).toBe(false)
    expect(getPurchaseCycleStatus({ ...base, wearLogs: logs })?.due).toBe(true)
  })

  it('reaches the Innerwear 729/730-day boundary and needs a basis date', () => {
    expect(getElapsedCalendarDays('2024-08-07', '2026-08-06')).toBe(729)
    expect(getElapsedCalendarDays('2024-08-06', '2026-08-06')).toBe(730)
    expect(
      getPurchaseCycleStatus({
        item: item('Innerwear', { acquiredOn: '2024-08-07' }),
        events: [],
        outfits,
        wearLogs: [],
        today: '2026-08-06',
      })?.due,
    ).toBe(false)
    expect(
      getPurchaseCycleStatus({
        item: item('Innerwear', { acquiredOn: '2024-08-06' }),
        events: [],
        outfits,
        wearLogs: [],
        today: '2026-08-06',
      })?.due,
    ).toBe(true)
    expect(
      getPurchaseCycleStatus({
        item: item('Innerwear', { acquiredOn: null }),
        events: [],
        outfits,
        wearLogs: [],
        today: '2026-08-06',
      }),
    ).toMatchObject({ currentValue: null, remaining: null, due: false })
  })

  it('ignores current quantity and excludes Retired Items', () => {
    expect(
      getPurchaseCycleStatus({
        item: item('Socks', { currentQuantity: 100 }),
        events: [],
        outfits,
        wearLogs: [],
        today: '2026-08-06',
      })?.currentValue,
    ).toBe(0)
    expect(
      getPurchaseCycleStatus({
        item: item('Socks', { retired: true }),
        events: [],
        outfits,
        wearLogs: [],
        today: '2026-08-06',
      }),
    ).toBeNull()
  })
})
