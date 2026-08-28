import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demo-data'
import type { AppData, WearLog } from './types'
import {
  buildItemTemperatureEvidenceIndex,
  itemHasTemperatureEvidenceNear,
} from './item-temperature-evidence'

function okLog(
  id: string,
  outfitId: string,
  temperature: number,
): WearLog {
  return {
    ...structuredClone(demoData.wearLogs[0]),
    id,
    outfitId,
    wornOn: `2026-08-${id.endsWith('hot') ? '02' : '01'}`,
    tempOut: temperature,
    tempBack: temperature,
    tempBackInferred: true,
    feelingOut: 'ok',
    feelingBack: 'ok',
    submissionToken: `${id}-token`,
  }
}

describe('item temperature evidence', () => {
  it('완성 착장의 OK 관측을 가방과 양말을 포함한 모든 Item에 적용한다', () => {
    const data: AppData = structuredClone(demoData)
    const template = data.items.find((item) => item.id === 'item-belt')
    const outfit = data.outfits.find(
      (entry) => entry.id === 'outfit-favorite',
    )
    if (!template || !outfit) throw new Error('fixture missing')

    data.items.push(
      { ...template, id: 'item-bag', name: '겨울 가방', category: 'Bags' },
      { ...template, id: 'item-socks', name: '겨울 양말', category: 'Socks' },
    )
    outfit.itemIds.push('item-bag', 'item-socks')

    const evidence = buildItemTemperatureEvidenceIndex(data)

    expect(evidence.get('item-bag')).toMatchObject({
      okRange: { min: 16, max: 22 },
      okObservationCount: 2,
      wearCount: 2,
    })
    expect(evidence.get('item-socks')).toMatchObject({
      okRange: { min: 16, max: 22 },
      okObservationCount: 2,
    })
  })

  it('불완전 착장과 Error 착장은 Item 온도 근거로 사용하지 않는다', () => {
    const data: AppData = structuredClone(demoData)
    data.outfits.push(
      {
        id: 'outfit-accessory-only',
        displayName: '벨트만 기록',
        rating: 'ok',
        itemIds: ['item-belt'],
      },
      {
        id: 'outfit-error-belt',
        displayName: 'Error 벨트 착장',
        rating: 'error',
        itemIds: ['item-tee', 'item-pants', 'item-shoes', 'item-belt'],
      },
    )
    data.wearLogs.push(
      okLog('log-accessory-only', 'outfit-accessory-only', 25),
      okLog('log-error-belt', 'outfit-error-belt', 25),
    )

    const evidence = buildItemTemperatureEvidenceIndex(data)

    expect(evidence.has('item-belt')).toBe(false)
  })

  it('보관된 과거 착장과 retired Item의 유효한 OK 관측은 유지한다', () => {
    const data: AppData = structuredClone(demoData)
    const belt = data.items.find((item) => item.id === 'item-belt')
    if (!belt) throw new Error('fixture missing')
    belt.retired = true
    data.outfits.push({
      id: 'outfit-archived-belt',
      displayName: '보관된 벨트 착장',
      rating: 'ok',
      archivedAt: '2026-08-03T00:00:00.000Z',
      itemIds: ['item-tee', 'item-pants', 'item-shoes', 'item-belt'],
    })
    data.wearLogs.push(okLog('log-archived-belt', 'outfit-archived-belt', 25))

    expect(buildItemTemperatureEvidenceIndex(data).get('item-belt')).toMatchObject({
      okRange: { min: 23, max: 27 },
      okObservationCount: 1,
    })
  })

  it('표시 범위 사이의 빈 구간은 실제 근처 OK 관측이 없으면 통과시키지 않는다', () => {
    const data: AppData = structuredClone(demoData)
    data.outfits.push(
      {
        id: 'outfit-belt-cold',
        displayName: '벨트 저온 착장',
        rating: 'ok',
        itemIds: ['item-tee', 'item-pants', 'item-shoes', 'item-belt'],
      },
      {
        id: 'outfit-belt-hot',
        displayName: '벨트 고온 착장',
        rating: 'ok',
        itemIds: ['item-tee', 'item-pants', 'item-shoes', 'item-belt'],
      },
    )
    data.wearLogs.push(
      okLog('log-belt-cold', 'outfit-belt-cold', 10),
      okLog('log-belt-hot', 'outfit-belt-hot', 30),
    )

    const evidence = buildItemTemperatureEvidenceIndex(data).get('item-belt')
    if (!evidence) throw new Error('temperature evidence missing')

    expect(evidence.okRange).toEqual({ min: 8, max: 32 })
    expect(itemHasTemperatureEvidenceNear(evidence, 10)).toBe(true)
    expect(itemHasTemperatureEvidenceNear(evidence, 20)).toBe(false)
    expect(itemHasTemperatureEvidenceNear(evidence, 30)).toBe(true)
  })
})
