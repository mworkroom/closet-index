import { describe, expect, it } from 'vitest'
import type { Item, Outfit, WearLog } from '../../lib/types'
import {
  getCompletedCalendarMonths,
  getItemInspectionSignals,
} from './inspection-signal'

function item(id: string, options: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    category: 'Top-T-shirts',
    semanticColor: null,
    displayHex: '#222222',
    seasons: [],
    retired: false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn: '2024-01-01',
    ...options,
  }
}

function outfit(id: string, itemIds: string[]): Outfit {
  return { id, displayName: null, rating: 'ok', itemIds }
}

function wearLog(id: string, outfitId: string, wornOn: string): WearLog {
  return {
    id,
    outfitId,
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
    memo: null,
    temperatureSource: 'notion',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: id,
    createdAt: `${wornOn}T00:00:00Z`,
  }
}

describe('P6-3 inspection signal', () => {
  it('누적 착용 0회를 점검으로 통합한다', () => {
    const signals = getItemInspectionSignals({
      items: [item('unworn')],
      outfits: [],
      wearLogs: [],
      today: '2026-08-06',
    })

    expect(signals.get('unworn')).toMatchObject({
      label: '점검',
      reason: '착용 기록 0회',
      wearCount: 0,
      lastWornOn: null,
    })
  })

  it('마지막 착용 2년 직전은 제외하고 도달일부터 점검한다', () => {
    const items = [item('before'), item('reached')]
    const outfits = [
      outfit('before-outfit', ['before']),
      outfit('reached-outfit', ['reached']),
    ]
    const signals = getItemInspectionSignals({
      items,
      outfits,
      wearLogs: [
        wearLog('before-log', 'before-outfit', '2024-08-07'),
        wearLog('reached-log', 'reached-outfit', '2024-08-06'),
      ],
      today: '2026-08-06',
    })

    expect(signals.has('before')).toBe(false)
    expect(signals.get('reached')?.reason).toBe('마지막 착용 2년 전')
  })

  it('오래된 마지막 착용을 완료 연·개월로 표시한다', () => {
    const signals = getItemInspectionSignals({
      items: [item('old')],
      outfits: [outfit('old-outfit', ['old'])],
      wearLogs: [wearLog('old-log', 'old-outfit', '2024-05-01')],
      today: '2026-08-06',
    })

    expect(signals.get('old')?.reason).toBe('마지막 착용 2년 3개월 전')
    expect(getCompletedCalendarMonths('2024-08-07', '2026-08-06')).toBe(23)
    expect(getCompletedCalendarMonths('2024-08-06', '2026-08-06')).toBe(24)
  })

  it('Innerwear와 Retired Item은 착용 0회여도 제외한다', () => {
    const signals = getItemInspectionSignals({
      items: [
        item('innerwear', { category: ' Innerwear ' }),
        item('retired', { retired: true }),
        item('innerwear-tee', { category: 'Top-T-shirts-innerwear' }),
      ],
      outfits: [],
      wearLogs: [],
      today: '2026-08-06',
    })

    expect(signals.has('innerwear')).toBe(false)
    expect(signals.has('retired')).toBe(false)
    expect(signals.get('innerwear-tee')?.reason).toBe('착용 기록 0회')
  })

  it('여러 Outfit의 Wear Log를 Item별로 합쳐 가장 최근 날짜를 쓴다', () => {
    const signals = getItemInspectionSignals({
      items: [item('shared')],
      outfits: [outfit('a', ['shared']), outfit('b', ['shared'])],
      wearLogs: [
        wearLog('old', 'a', '2023-01-01'),
        wearLog('recent', 'b', '2026-01-01'),
      ],
      today: '2026-08-06',
    })

    expect(signals.has('shared')).toBe(false)
  })
})
