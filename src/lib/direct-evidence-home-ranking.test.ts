import { describe, expect, it } from 'vitest'
import {
  phase5BaselineOutfit,
  phase5BaselineWearLog,
  phase5RecommendationBaselineFixture,
} from './fixtures/phase5-recommendation-baseline'
import {
  isLocalDirectEvidenceE2Enabled,
  rankHomeRecommendationsWithDirectEvidenceE2,
} from './direct-evidence-home-ranking'
import { partitionRecommendations, recommendOutfits } from './recommendation'
import type {
  AppData,
  RecommendationInput,
  RecommendationResult,
} from './types'

const input: RecommendationInput = {
  tempOut: 33,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'place-nearby',
  transportModeId: 'walk-short',
}

function result(
  id: string,
  overrides: Partial<RecommendationResult> = {},
): RecommendationResult {
  return {
    outfit: phase5BaselineOutfit(id, id.includes('favorite') ? 'favorite' : 'ok'),
    level: 'high',
    evidence: 'observed',
    similarEvidence: null,
    contextEvidence: {} as RecommendationResult['contextEvidence'],
    reasons: [`${id} baseline reason`],
    warnings: [`${id} baseline warning`],
    okRange: { min: 30, max: 35 },
    okObservationCount: 1,
    targetTemp: 33,
    wearCount: 1,
    lastWornOn: '2026-06-01',
    latestAcquiredOn: null,
    latestAcquiredItemNames: [],
    ...overrides,
  }
}

function dataWithWearLogs(...wearLogs: AppData['wearLogs']): AppData {
  return {
    ...structuredClone(phase5RecommendationBaselineFixture),
    wearLogs,
  }
}

describe('disabled HOME Policy E2 + cap 1 integration', () => {
  it('defaults false and is forced false outside development', () => {
    expect(isLocalDirectEvidenceE2Enabled(true, undefined)).toBe(false)
    expect(isLocalDirectEvidenceE2Enabled(true, 'false')).toBe(false)
    expect(isLocalDirectEvidenceE2Enabled(true, 'true')).toBe(true)
    expect(isLocalDirectEvidenceE2Enabled(false, 'true')).toBe(false)
  })

  it('returns the exact baseline arrays and partition object when disabled', () => {
    const data = structuredClone(phase5RecommendationBaselineFixture)
    const baselineResults = recommendOutfits(data, input)
    const baselineGroups = partitionRecommendations(baselineResults)
    const disabled = rankHomeRecommendationsWithDirectEvidenceE2(
      data,
      input,
      baselineGroups,
      false,
    )

    expect(disabled.groups).toBe(baselineGroups)
    expect(disabled.groups).toEqual(partitionRecommendations(baselineResults))
    expect(disabled.groups.recentPurchases).toBe(baselineGroups.recentPurchases)
    expect(disabled.groups.recommendations).toBe(baselineGroups.recommendations)
    expect(disabled.groups.trialRecommendations).toBe(
      baselineGroups.trialRecommendations,
    )
    expect(disabled.simulation).toBeNull()
    expect(disabled.movedPairs).toEqual([])
  })

  it('moves direct support up one position and explains the swapped pair', () => {
    const preferred = result('favorite-baseline', { wearCount: 4 })
    const supported = result('supported-context', { wearCount: 2 })
    const groups = {
      recentPurchases: [],
      recommendations: [preferred, supported],
      trialRecommendations: [],
    }
    const data = dataWithWearLogs(
      phase5BaselineWearLog(
        'support-log',
        supported.outfit.id,
        '2026-07-30',
        {
          tempOut: 33,
          feelingOut: 'ok',
          placeId: input.placeId,
          transportModeId: input.transportModeId,
        },
      ),
    )
    const ranked = rankHomeRecommendationsWithDirectEvidenceE2(
      data,
      input,
      groups,
      true,
    )

    expect(ranked.groups.recommendations).toEqual([supported, preferred])
    expect(ranked.simulation).toMatchObject({
      variant: 'E2',
      movementCap: 1,
      maximumIndividualMovement: 1,
      groupMembershipChanges: 0,
    })
    expect(ranked.movedPairs).toEqual([
      expect.objectContaining({
        group: 'recommendations',
        level: 'high',
        baselinePreferredOutfitId: preferred.outfit.id,
        policyTargetOutfitId: supported.outfit.id,
        baselinePreferenceFactor: 'rating',
        policyExplanation: 'direct_support이므로 최대 1칸 상승',
        candidates: [
          expect.objectContaining({
            outfitId: preferred.outfit.id,
            baselineRank: 1,
            e2Rank: 2,
            reasons: preferred.reasons,
            warnings: preferred.warnings,
          }),
          expect.objectContaining({
            outfitId: supported.outfit.id,
            baselineRank: 2,
            e2Rank: 1,
            directEvidenceOutcome: 'direct_support',
            confidence: 'observed-once',
            matchedExactContextWearLogCount: 1,
            matchedObservations: [
              expect.objectContaining({
                wearLogId: 'support-log',
                historicalTemperature: 33,
                feeling: 'ok',
                inferredReturn: false,
              }),
            ],
          }),
        ],
      }),
    ])
  })

  it('moves direct issue down by one and keeps mixed and unknown neutral', () => {
    const issue = result('issue')
    const neutral = result('neutral')
    const mixed = result('mixed')
    const groups = {
      recentPurchases: [],
      recommendations: [issue, neutral, mixed],
      trialRecommendations: [],
    }
    const data = dataWithWearLogs(
      phase5BaselineWearLog('issue-log', issue.outfit.id, '2026-07-01', {
        tempOut: 33,
        feelingOut: 'hot',
        placeId: input.placeId,
        transportModeId: input.transportModeId,
      }),
      phase5BaselineWearLog('mixed-ok', mixed.outfit.id, '2026-07-01', {
        tempOut: 33,
        feelingOut: 'ok',
        placeId: input.placeId,
        transportModeId: input.transportModeId,
      }),
      phase5BaselineWearLog('mixed-hot', mixed.outfit.id, '2026-07-02', {
        tempOut: 34,
        feelingOut: 'hot',
        placeId: input.placeId,
        transportModeId: input.transportModeId,
      }),
    )
    const ranked = rankHomeRecommendationsWithDirectEvidenceE2(
      data,
      input,
      groups,
      true,
    )

    expect(ranked.groups.recommendations).toEqual([neutral, issue, mixed])
    expect(
      ranked.evidenceByOutfitId.get(mixed.outfit.id)?.exactContext.outcome,
    ).toBe('mixed')
    expect(
      ranked.evidenceByOutfitId.get(neutral.outfit.id)?.exactContext.outcome,
    ).toBe('unknown')
    expect(ranked.simulation?.maximumIndividualMovement).toBe(1)
  })

  it('preserves partition and recommendation-level membership and result content', () => {
    const recentIssue = result('recent-issue', { level: 'high' })
    const recentNeutral = result('recent-neutral', { level: 'high' })
    const normalSupport = result('normal-support', { level: 'possible' })
    const normalNeutral = result('normal-neutral', { level: 'possible' })
    const trialSupport = result('trial-support', {
      level: 'caution',
      evidence: 'untried',
    })
    const groups = {
      recentPurchases: [recentIssue, recentNeutral],
      recommendations: [normalNeutral, normalSupport],
      trialRecommendations: [trialSupport],
    }
    const relevant = (id: string, feelingOut: 'ok' | 'hot') =>
      phase5BaselineWearLog(`${id}-log`, id, '2026-07-01', {
        tempOut: 33,
        feelingOut,
        placeId: input.placeId,
        transportModeId: input.transportModeId,
      })
    const ranked = rankHomeRecommendationsWithDirectEvidenceE2(
      dataWithWearLogs(
        relevant(recentIssue.outfit.id, 'hot'),
        relevant(normalSupport.outfit.id, 'ok'),
        relevant(trialSupport.outfit.id, 'ok'),
      ),
      input,
      groups,
      true,
    )

    expect(ranked.groups.recentPurchases).toEqual([
      recentNeutral,
      recentIssue,
    ])
    expect(ranked.groups.recommendations).toEqual([
      normalSupport,
      normalNeutral,
    ])
    expect(ranked.groups.trialRecommendations).toEqual([trialSupport])
    expect(ranked.simulation?.groupMembershipChanges).toBe(0)
    expect(ranked.groups.recentPurchases[1]).toBe(recentIssue)
    expect(ranked.groups.recentPurchases[1].warnings).toBe(recentIssue.warnings)
    expect(ranked.groups.recommendations[0].reasons).toBe(normalSupport.reasons)
  })

  it('does not use inferred return evidence or rank when Place or Transport is null', () => {
    const neutral = result('neutral')
    const inferred = result('inferred')
    const groups = {
      recentPurchases: [],
      recommendations: [neutral, inferred],
      trialRecommendations: [],
    }
    const data = dataWithWearLogs(
      phase5BaselineWearLog('inferred-log', inferred.outfit.id, '2026-07-01', {
        tempOut: 20,
        feelingOut: null,
        tempBack: 33,
        tempBackInferred: true,
        feelingBack: 'ok',
        placeId: input.placeId,
        transportModeId: input.transportModeId,
      }),
    )

    const inferredOnly = rankHomeRecommendationsWithDirectEvidenceE2(
      data,
      { ...input, tempOut: 20, tempBack: 33 },
      groups,
      true,
    )
    expect(inferredOnly.groups).toEqual(groups)
    expect(
      inferredOnly.evidenceByOutfitId.get(inferred.outfit.id)?.exactContext
        .inferredReturnAuditObservationCount,
    ).toBe(1)

    for (const missing of [
      { ...input, placeId: null },
      { ...input, transportModeId: null },
    ]) {
      expect(
        rankHomeRecommendationsWithDirectEvidenceE2(
          dataWithWearLogs(
            phase5BaselineWearLog(
              'support-log',
              inferred.outfit.id,
              '2026-07-01',
              {
                tempOut: 33,
                feelingOut: 'ok',
                placeId: input.placeId,
                transportModeId: input.transportModeId,
              },
            ),
          ),
          missing,
          groups,
          true,
        ).groups,
      ).toEqual(groups)
    }
  })
})
