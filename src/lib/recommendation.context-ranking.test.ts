import { describe, expect, it } from 'vitest'
import {
  phase5BaselineOutfit,
  phase5BaselineWearLog,
  phase5RecommendationBaselineFixture,
} from './fixtures/phase5-recommendation-baseline'
import { recommendOutfits } from './recommendation'
import type { AppData, RecommendationInput } from './types'

const input: RecommendationInput = {
  tempOut: 20,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'place-a',
  transportModeId: 'transport-a',
}

function comparisonFixture(): AppData {
  return {
    ...structuredClone(phase5RecommendationBaselineFixture),
    outfits: [
      phase5BaselineOutfit('favorite-baseline', 'favorite'),
      phase5BaselineOutfit('repeated-context', 'ok'),
    ],
    wearLogs: [
      phase5BaselineWearLog(
        'favorite-1',
        'favorite-baseline',
        '2026-03-01',
      ),
      phase5BaselineWearLog(
        'context-1',
        'repeated-context',
        '2026-01-01',
      ),
      phase5BaselineWearLog(
        'context-2',
        'repeated-context',
        '2026-02-01',
      ),
    ],
  }
}

describe('disabled P5A context ranking integration', () => {
  it('keeps the current result order and reasons when the option is omitted', () => {
    const data = comparisonFixture()
    const implicit = recommendOutfits(data, input)
    const explicitDisabled = recommendOutfits(data, input, {
      enableContextRanking: false,
    })

    expect(implicit).toEqual(explicitDisabled)
    expect(implicit.map((result) => result.outfit.id)).toEqual([
      'favorite-baseline',
      'repeated-context',
    ])
    expect(implicit[1].reasons).toContain('같은 장소에서 2회 착용')
    expect(implicit[1].reasons).toContain('같은 교통수단으로 2회 착용')
  })

  it('produces an explicit old-versus-new ranking comparison for the fixture', () => {
    const data = comparisonFixture()
    const oldResults = recommendOutfits(data, input)
    const newResults = recommendOutfits(data, input, {
      enableContextRanking: true,
    })

    expect({
      old: oldResults.map((result) => result.outfit.id),
      proposed: newResults.map((result) => result.outfit.id),
    }).toEqual({
      old: ['favorite-baseline', 'repeated-context'],
      proposed: ['repeated-context', 'favorite-baseline'],
    })
  })

  it('uses the same structured evidence for ranking and the proposed reason', () => {
    const result = recommendOutfits(comparisonFixture(), input, {
      enableContextRanking: true,
    })[0]

    expect(result.contextEvidence.activeTier).toBe('exact')
    expect(result.contextEvidence.exact).toMatchObject({
      matchedWearLogIds: ['context-1', 'context-2'],
      exposureCount: 2,
      successCount: 2,
      issueCount: 0,
      unknownCount: 0,
    })
    expect(result.reasons).toContain(
      '같은 장소·교통수단에서 2회 착용 · 성공 2회',
    )
    expect(result.reasons).not.toContain('같은 장소에서 2회 착용')
  })

  it('never lets context override temperature risk eligibility', () => {
    const data: AppData = {
      ...comparisonFixture(),
      outfits: [
        phase5BaselineOutfit('safe', 'ok'),
        phase5BaselineOutfit('context-caution', 'favorite'),
      ],
      wearLogs: [
        phase5BaselineWearLog('safe-1', 'safe', '2026-01-01'),
        phase5BaselineWearLog(
          'caution-1',
          'context-caution',
          '2026-01-01',
          { tempOut: 30, feelingOut: 'ok' },
        ),
        phase5BaselineWearLog(
          'caution-2',
          'context-caution',
          '2026-01-02',
          { tempOut: 30, feelingOut: 'ok' },
        ),
        phase5BaselineWearLog(
          'caution-3',
          'context-caution',
          '2026-01-03',
          { tempOut: 30, feelingOut: 'ok' },
        ),
      ],
    }

    const results = recommendOutfits(data, input, {
      enableContextRanking: true,
    })

    expect(results.map((result) => [result.outfit.id, result.level])).toEqual([
      ['safe', 'high'],
      ['context-caution', 'caution'],
    ])
  })

  it('falls back to the exact baseline comparator when context evidence ties', () => {
    const data: AppData = {
      ...comparisonFixture(),
      outfits: [
        phase5BaselineOutfit('favorite', 'favorite'),
        phase5BaselineOutfit('ok', 'ok'),
      ],
      wearLogs: [
        phase5BaselineWearLog('favorite-1', 'favorite', '2026-01-01'),
        phase5BaselineWearLog('favorite-2', 'favorite', '2026-01-02'),
        phase5BaselineWearLog('ok-1', 'ok', '2026-03-01'),
        phase5BaselineWearLog('ok-2', 'ok', '2026-03-02'),
      ],
    }

    const oldOrder = recommendOutfits(data, input).map(
      (result) => result.outfit.id,
    )
    const proposedOrder = recommendOutfits(data, input, {
      enableContextRanking: true,
    }).map((result) => result.outfit.id)

    expect(proposedOrder).toEqual(oldOrder)
    expect(proposedOrder).toEqual(['favorite', 'ok'])
  })

  it('uses Place-only fallback when current Transport is missing', () => {
    const results = recommendOutfits(comparisonFixture(), {
      ...input,
      transportModeId: null,
    }, {
      enableContextRanking: true,
    })
    const repeated = results.find(
      (result) => result.outfit.id === 'repeated-context',
    )

    expect(repeated?.contextEvidence.exact.enabled).toBe(false)
    expect(repeated?.contextEvidence.activeTier).toBe('place')
    expect(repeated?.reasons).toContain(
      '같은 장소에서 2회 착용 · 교통수단 fallback · 성공 2회',
    )
  })
})

