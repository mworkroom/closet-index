import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demo-data'
import type { AppData, RecommendationInput, WearLog } from './types'
import { recommendOutfits } from './recommendation'

const baseInput: RecommendationInput = {
  tempOut: 20,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: null,
  transportModeId: null,
}

function wearLog(id: string, outfitId: string, wornOn: string): WearLog {
  return {
    ...structuredClone(demoData.wearLogs[0]),
    id,
    outfitId,
    wornOn,
    submissionToken: `submission-${id}`,
    createdAt: `${wornOn}T12:00:00+09:00`,
  }
}

describe('recommendOutfits', () => {
  it('평균 온도 적합성을 Favorite보다 먼저 평가한다', () => {
    const results = recommendOutfits(demoData, {
      ...baseInput,
      tempOut: 26,
      tempBack: 27,
    })

    expect(results[0].outfit.id).toBe('outfit-summer')
    expect(results.find((result) => result.outfit.id === 'outfit-favorite')).toBeDefined()
  })

  it('Error와 Retired 아이템 포함 착장을 기본 추천에서 제외한다', () => {
    const results = recommendOutfits(demoData, baseInput)
    expect(results.map((result) => result.outfit.id)).not.toContain('outfit-error')
  })

  it('Rating이 OK여도 Retired 아이템을 하나라도 포함하면 추천하지 않는다', () => {
    const data: AppData = structuredClone(demoData)
    data.outfits.push({
      id: 'outfit-retired-only',
      displayName: null,
      rating: 'ok',
      itemIds: ['item-retired'],
    })

    const results = recommendOutfits(data, baseInput)

    expect(results.map((result) => result.outfit.id)).not.toContain(
      'outfit-retired-only',
    )
  })

  it('착용 기록이 없는 Outfit을 시험 착장으로 분류한다', () => {
    const data: AppData = {
      ...structuredClone(demoData),
      outfits: [
        {
          id: 'untried',
          displayName: null,
          rating: null,
          itemIds: ['item-pants'],
        },
      ],
      wearLogs: [],
    }

    expect(
      recommendOutfits(data, baseInput).find(
        (result) => result.outfit.id === 'untried',
      )?.evidence,
    ).toBe('untried')

    data.wearLogs.push(wearLog('untried-1', 'untried', '2026-01-01'))

    expect(
      recommendOutfits(data, baseInput).find(
        (result) => result.outfit.id === 'untried',
      )?.evidence,
    ).toBe('observed')
  })

  it('귀가 온도가 추움 관측과 충돌하면 주의 경고를 만든다', () => {
    const result = recommendOutfits(demoData, {
      ...baseInput,
      tempOut: 18,
      tempBack: 14,
    }).find((entry) => entry.outfit.id === 'outfit-favorite')

    expect(result?.level).toBe('caution')
    expect(result?.warnings).toContain('귀가 14°C — 15°C에서 추웠던 기록 있음')
  })

  it('귀가 온도 미입력 시 출발 온도를 추천 기준으로 사용한다', () => {
    const result = recommendOutfits(demoData, {
      ...baseInput,
      tempOut: 20,
      tempBack: null,
    }).find((entry) => entry.outfit.id === 'outfit-favorite')

    expect(result?.targetTemp).toBe(20)
  })

  it('같은 착용의 동일 온도·동일 체감은 한 번만 반영한다', () => {
    const result = recommendOutfits(demoData, baseInput).find(
      (entry) => entry.outfit.id === 'outfit-favorite',
    )

    expect(result?.reasons[0]).toContain('OK 2회')
  })

  it('비 적합성 미확인은 제외하지 않고 추천 가능 경고로 남긴다', () => {
    const data: AppData = structuredClone(demoData)
    const cardigan = data.items.find((item) => item.id === 'item-cardigan')
    if (!cardigan) throw new Error('fixture missing')
    cardigan.rainOk = 'unknown'
    const shoes = data.items.find((item) => item.id === 'item-shoes')
    if (!shoes) throw new Error('fixture missing')
    shoes.rainOk = 'suitable'

    const result = recommendOutfits(data, {
      ...baseInput,
      rainCondition: 'yes',
    }).find((entry) => entry.outfit.id === 'outfit-favorite')

    expect(result?.level).toBe('possible')
    expect(result?.warnings).toContain('비 적합성 미확인 1개')
  })

  it('같은 날짜와 같은 Outfit의 여러 Wear Log를 모두 집계한다', () => {
    const data: AppData = structuredClone(demoData)
    const source = data.wearLogs[0]
    const duplicateDate: WearLog = {
      ...source,
      id: 'log-same-date',
      placeId: 'place-cgv',
      submissionToken: 'another-submission',
    }
    data.wearLogs.push(duplicateDate)

    const result = recommendOutfits(data, baseInput).find(
      (entry) => entry.outfit.id === source.outfitId,
    )

    expect(result?.wearCount).toBe(3)
  })

  it('온도와 Rating이 같으면 착용 근거가 많은 Outfit을 먼저 추천한다', () => {
    const data: AppData = {
      ...structuredClone(demoData),
      outfits: [
        { id: 'many', displayName: null, rating: 'ok', itemIds: ['item-pants'] },
        { id: 'few', displayName: null, rating: 'ok', itemIds: ['item-pants'] },
      ],
      wearLogs: [
        wearLog('many-1', 'many', '2025-01-01'),
        wearLog('many-2', 'many', '2025-02-01'),
        wearLog('few-1', 'few', '2026-01-01'),
      ],
    }

    expect(recommendOutfits(data, baseInput).map((entry) => entry.outfit.id)).toEqual([
      'many',
      'few',
    ])
  })

  it('착용 근거까지 같으면 최근 착용한 Outfit을 먼저 추천한다', () => {
    const data: AppData = {
      ...structuredClone(demoData),
      outfits: [
        { id: 'older', displayName: null, rating: 'ok', itemIds: ['item-pants'] },
        { id: 'recent', displayName: null, rating: 'ok', itemIds: ['item-pants'] },
      ],
      wearLogs: [
        wearLog('older-1', 'older', '2025-01-01'),
        wearLog('recent-1', 'recent', '2026-01-01'),
      ],
    }

    expect(recommendOutfits(data, baseInput).map((entry) => entry.outfit.id)).toEqual([
      'recent',
      'older',
    ])
  })

  it('모든 값이 같을 때 Outfit UUID로 안정적으로 정렬한다', () => {
    const data: AppData = {
      ...structuredClone(demoData),
      outfits: [
        { id: 'b', displayName: null, rating: 'ok', itemIds: ['item-pants'] },
        { id: 'a', displayName: null, rating: 'ok', itemIds: ['item-pants'] },
      ],
      wearLogs: [],
    }

    expect(recommendOutfits(data, baseInput).map((entry) => entry.outfit.id)).toEqual([
      'a',
      'b',
    ])
  })
})
