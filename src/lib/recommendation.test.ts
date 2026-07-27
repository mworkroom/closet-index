import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demo-data'
import type { AppData, RecommendationInput, WearLog } from './types'
import { partitionRecommendations, recommendOutfits } from './recommendation'

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

  it('미착용 Outfit에 구성품이 겹치는 과거 착장의 부분 근거를 계산한다', () => {
    const data: AppData = structuredClone(demoData)
    const shoes = data.items.find((item) => item.id === 'item-shoes')
    if (!shoes) throw new Error('fixture missing')
    data.items.push({
      ...shoes,
      id: 'item-new-shoes',
      name: '새 신발',
    })
    data.outfits = [
      {
        id: 'observed',
        displayName: '과거 착장',
        rating: 'ok',
        itemIds: ['item-cardigan', 'item-knit', 'item-pants', 'item-shoes'],
      },
      {
        id: 'untried',
        displayName: '새 신발 착장',
        rating: null,
        itemIds: ['item-cardigan', 'item-knit', 'item-pants', 'item-new-shoes'],
      },
    ]
    data.wearLogs = [
      wearLog('observed-1', 'observed', '2026-06-01'),
      wearLog('observed-2', 'observed', '2026-07-01'),
    ]

    const result = recommendOutfits(data, baseInput).find(
      (entry) => entry.outfit.id === 'untried',
    )
    const best = result?.similarEvidence?.matches[0]

    expect(result?.evidence).toBe('untried')
    expect(result?.level).toBe('caution')
    expect(result?.similarEvidence?.confidence).toBe('medium')
    expect(best?.outfitId).toBe('observed')
    expect(best?.sharedItemCount).toBe(3)
    expect(best?.targetItemCount).toBe(4)
    expect(best?.changedItemNames).toEqual(['새 신발'])
    expect(best?.weightedSimilarity).toBeCloseTo(0.8)
    expect(result?.reasons[0]).toBe('비슷한 과거 착장 3/4개 일치')
  })

  it('가방과 액세서리만 겹치는 과거 Outfit은 온도 근거로 쓰지 않는다', () => {
    const data: AppData = structuredClone(demoData)
    const template = data.items[0]
    data.items = [
      {
        ...template,
        id: 'bag',
        name: '가방',
        category: 'Bags',
      },
      {
        ...template,
        id: 'accessory',
        name: '액세서리',
        category: 'Accessories',
      },
      {
        ...template,
        id: 'new-top',
        name: '새 상의',
        category: 'Top-Shirts',
      },
    ]
    data.outfits = [
      {
        id: 'observed',
        displayName: null,
        rating: 'ok',
        itemIds: ['bag', 'accessory'],
      },
      {
        id: 'untried',
        displayName: null,
        rating: null,
        itemIds: ['bag', 'accessory', 'new-top'],
      },
    ]
    data.wearLogs = [wearLog('observed-1', 'observed', '2026-07-01')]

    const result = recommendOutfits(data, baseInput).find(
      (entry) => entry.outfit.id === 'untried',
    )

    expect(result?.similarEvidence).toBeNull()
    expect(result?.reasons[0]).toBe('온도 근거 없음')
  })

  it('직접 착용 기록이 생기면 유사 착장 대신 직접 근거만 사용한다', () => {
    const data: AppData = {
      ...structuredClone(demoData),
      outfits: [
        {
          id: 'observed',
          displayName: null,
          rating: 'ok',
          itemIds: ['item-cardigan', 'item-knit', 'item-pants'],
        },
        {
          id: 'target',
          displayName: null,
          rating: null,
          itemIds: ['item-cardigan', 'item-knit', 'item-pants', 'item-shoes'],
        },
      ],
      wearLogs: [
        wearLog('observed-1', 'observed', '2026-06-01'),
        wearLog('target-1', 'target', '2026-07-01'),
      ],
    }

    const result = recommendOutfits(data, baseInput).find(
      (entry) => entry.outfit.id === 'target',
    )

    expect(result?.evidence).toBe('observed')
    expect(result?.similarEvidence).toBeNull()
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
    expect(result?.okObservationCount).toBe(2)
  })

  it('비 오는 날은 불가로 지정한 아이템만 경고한다', () => {
    const data: AppData = structuredClone(demoData)
    const cardigan = data.items.find((item) => item.id === 'item-cardigan')
    if (!cardigan) throw new Error('fixture missing')
    cardigan.rainOk = true
    const shoes = data.items.find((item) => item.id === 'item-shoes')
    if (!shoes) throw new Error('fixture missing')
    shoes.rainOk = true

    const result = recommendOutfits(data, {
      ...baseInput,
      rainCondition: 'yes',
    }).find((entry) => entry.outfit.id === 'outfit-favorite')

    expect(result?.warnings).not.toContain(expect.stringContaining('비에 부적합'))

    cardigan.rainOk = false
    const blockedResult = recommendOutfits(data, {
      ...baseInput,
      rainCondition: 'yes',
    }).find((entry) => entry.outfit.id === 'outfit-favorite')

    expect(blockedResult?.level).toBe('caution')
    expect(blockedResult?.warnings).toContain('비에 부적합: 블루 가디건')
  })

  it('장거리 걷기는 신발의 불가 여부만 검사한다', () => {
    const data: AppData = structuredClone(demoData)
    const cardigan = data.items.find((item) => item.id === 'item-cardigan')
    const shoes = data.items.find((item) => item.id === 'item-shoes')
    if (!cardigan || !shoes) throw new Error('fixture missing')
    cardigan.longWalkOk = false
    shoes.longWalkOk = true

    const allowed = recommendOutfits(data, {
      ...baseInput,
      longWalkCondition: 'yes',
    }).find((entry) => entry.outfit.id === 'outfit-favorite')

    expect(allowed?.warnings).not.toContain(
      expect.stringContaining('오래 걷기 부적합'),
    )

    shoes.longWalkOk = false
    const blocked = recommendOutfits(data, {
      ...baseInput,
      longWalkCondition: 'yes',
    }).find((entry) => entry.outfit.id === 'outfit-favorite')

    expect(blocked?.level).toBe('caution')
    expect(blocked?.warnings).toContain('오래 걷기 부적합: 화이트 스니커즈')
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

  it('Outfit에서 구매일이 가장 최근인 아이템을 식별한다', () => {
    const result = recommendOutfits(demoData, baseInput).find(
      (entry) => entry.outfit.id === 'outfit-favorite',
    )

    expect(result?.latestAcquiredOn).toBe('2026-07-01')
    expect(result?.latestAcquiredItemNames).toEqual(['블루 가디건'])
  })

  it('최근 구매 기준에서 보조 카테고리는 제외하고 Acc-Neck-made는 포함한다', () => {
    const data: AppData = structuredClone(demoData)
    const template = data.items.find((item) => item.id === 'item-pants')
    if (!template) throw new Error('fixture missing')

    const categoryItems = [
      { id: 'innerwear', name: '이너웨어', category: 'Innerwear' },
      { id: 'socks', name: '양말', category: 'Socks' },
      { id: 'acc-neck', name: '기성 목 액세서리', category: 'Acc-Neck' },
      { id: 'acc-head-made', name: '손뜨개 머리 액세서리', category: 'Acc-Head-made' },
      { id: 'acc-hands-made', name: '손뜨개 손 액세서리', category: 'Acc-Hands-made' },
    ].map((item, index) => ({
      ...template,
      ...item,
      acquiredOn: `2026-07-${String(index + 20).padStart(2, '0')}`,
    }))
    const madeNeck = {
      ...template,
      id: 'acc-neck-made',
      name: '손뜨개 목 액세서리',
      category: 'Acc-Neck-made',
      acquiredOn: '2026-07-10',
    }
    data.items = [template, ...categoryItems, madeNeck]
    data.outfits = [
      {
        id: 'category-filter',
        displayName: null,
        rating: 'ok',
        itemIds: data.items.map((item) => item.id),
      },
    ]
    data.wearLogs = [wearLog('category-filter-log', 'category-filter', '2026-07-01')]

    const result = recommendOutfits(data, baseInput)[0]

    expect(result.latestAcquiredOn).toBe('2026-07-10')
    expect(result.latestAcquiredItemNames).toEqual(['손뜨개 목 액세서리'])
  })

  it('오늘 온도에 맞는 최근 구매 착장만 별도 영역으로 분리한다', () => {
    const groups = partitionRecommendations(
      recommendOutfits(demoData, baseInput),
      10,
    )
    const recentIds = groups.recentPurchases.map((entry) => entry.outfit.id)
    const remainingIds = [
      ...groups.recommendations,
      ...groups.trialRecommendations,
      ...groups.unknownTrialRecommendations,
    ].map((entry) => entry.outfit.id)

    expect(recentIds).toContain('outfit-favorite')
    expect(recentIds).not.toContain('outfit-layered')
    expect(remainingIds).not.toContain(recentIds[0])
  })

  it('부분 근거 온도가 맞지 않는 최근 구매 시험 착장은 오늘 후보에서 제외한다', () => {
    const coldGroups = partitionRecommendations(
      recommendOutfits(demoData, {
        ...baseInput,
        tempOut: 13,
      }),
      10,
    )
    const warmGroups = partitionRecommendations(
      recommendOutfits(demoData, {
        ...baseInput,
        tempOut: 26,
      }),
      10,
    )

    expect(coldGroups.recentPurchases.map((entry) => entry.outfit.id)).not.toContain(
      'outfit-layered',
    )
    expect(
      coldGroups.trialRecommendations.map((entry) => entry.outfit.id),
    ).not.toContain('outfit-layered')
    expect(
      coldGroups.unknownTrialRecommendations.map((entry) => entry.outfit.id),
    ).not.toContain('outfit-layered')
    expect(warmGroups.recentPurchases.map((entry) => entry.outfit.id)).toContain(
      'outfit-layered',
    )
  })

  it('OK 온도 근거가 없는 시험 착장은 미확인 후보로 분리한다', () => {
    const data: AppData = {
      ...structuredClone(demoData),
      outfits: [
        {
          id: 'unknown-trial',
          displayName: null,
          rating: null,
          itemIds: ['item-pants'],
        },
      ],
      wearLogs: [],
    }

    const groups = partitionRecommendations(recommendOutfits(data, baseInput), 10)

    expect(groups.recentPurchases).toHaveLength(0)
    expect(groups.trialRecommendations).toHaveLength(0)
    expect(
      groups.unknownTrialRecommendations.map((entry) => entry.outfit.id),
    ).toEqual(['unknown-trial'])
  })
})
