import { describe, expect, it } from 'vitest'
import { phase5BaselineWearLog } from './fixtures/phase5-recommendation-baseline'
import {
  calculateDirectEvidence,
  simulateDirectEvidenceGroup,
  simulateDirectEvidencePartitions,
  type DirectEvidence,
  type DirectEvidencePolicyCandidate,
} from './direct-evidence-policy'
import type {
  RecommendationInput,
  RecommendationLevel,
  RecommendationResult,
  WearLog,
} from './types'

const input: RecommendationInput = {
  tempOut: 33,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'place-nearby',
  transportModeId: 'walk-short',
}

function wear(
  id: string,
  temperature: number | null,
  feeling: WearLog['feelingOut'],
  overrides: Partial<WearLog> = {},
) {
  return phase5BaselineWearLog(id, 'outfit', '2026-07-01', {
    tempOut: temperature,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: feeling,
    feelingBack: null,
    placeId: 'place-nearby',
    transportModeId: 'walk-short',
    ...overrides,
  })
}

describe('Policy E direct evidence', () => {
  it('keeps a 24°C short-Walk OK observation unknown for 33°C', () => {
    const evidence = calculateDirectEvidence([wear('cool', 24, 'ok')], input)

    expect(evidence.exactContext).toMatchObject({
      outcome: 'unknown',
      confidence: 'none',
      distinctWearLogCount: 0,
      observationCount: 0,
    })
  })

  it('recognizes one relevant OK observation as observed-once direct support', () => {
    const evidence = calculateDirectEvidence([wear('support', 33, 'ok')], input)

    expect(evidence.exactContext).toMatchObject({
      outcome: 'direct_support',
      confidence: 'observed-once',
      matchedWearLogIds: ['support'],
      distinctWearLogCount: 1,
      observationCount: 1,
    })
    expect(evidence.exactContext.observations[0]).toMatchObject({
      endpoint: 'departure',
      currentTemperature: 33,
      historicalTemperature: 33,
      feeling: 'ok',
      wornOn: '2026-07-01',
      inferredReturn: false,
      placeId: 'place-nearby',
      transportModeId: 'walk-short',
    })
  })

  it('recognizes one relevant hot observation as observed-once direct issue', () => {
    expect(
      calculateDirectEvidence([wear('issue', 33, 'hot')], input).exactContext,
    ).toMatchObject({
      outcome: 'direct_issue',
      confidence: 'observed-once',
      matchedWearLogIds: ['issue'],
    })
  })

  it('keeps two cooler OK records neutral instead of inventing strong negative evidence', () => {
    const evidence = calculateDirectEvidence(
      [wear('cool-a', 26, 'ok'), wear('cool-b', 28, 'ok')],
      input,
    )

    expect(evidence.exactContext).toMatchObject({
      outcome: 'unknown',
      confidence: 'none',
      distinctWearLogCount: 0,
    })
  })

  it('marks two consistent relevant OK Wear Logs as repeated direct support', () => {
    const evidence = calculateDirectEvidence(
      [wear('support-b', 35, 'ok'), wear('support-a', 32, 'ok')],
      input,
    )

    expect(evidence.exactContext).toMatchObject({
      outcome: 'direct_support',
      confidence: 'repeated',
      distinctWearLogCount: 2,
      observationCount: 2,
      matchedWearLogIds: ['support-a', 'support-b'],
    })
  })

  it('keeps relevant OK and hot observations mixed', () => {
    const evidence = calculateDirectEvidence(
      [wear('ok', 33, 'ok'), wear('hot', 34, 'hot')],
      input,
    )

    expect(evidence.exactContext).toMatchObject({
      outcome: 'mixed',
      confidence: 'mixed',
      distinctWearLogCount: 2,
    })
  })

  it('reports same-Transport evidence from another Place without exact ranking evidence', () => {
    const evidence = calculateDirectEvidence(
      [wear('other-place', 33, 'ok', { placeId: 'place-other' })],
      input,
    )

    expect(evidence.exactContext.outcome).toBe('unknown')
    expect(evidence.currentTransport).toMatchObject({
      outcome: 'direct_support',
      confidence: 'observed-once',
      matchedWearLogIds: ['other-place'],
    })
  })

  it('disables ranking evidence for Place null and Transport null', () => {
    const logs = [wear('support', 33, 'ok')]
    const noPlace = calculateDirectEvidence(logs, { ...input, placeId: null })
    const noTransport = calculateDirectEvidence(logs, {
      ...input,
      transportModeId: null,
    })

    expect(noPlace.exactContext.enabled).toBe(false)
    expect(noPlace.exactContext.outcome).toBe('unknown')
    expect(noPlace.currentTransport.outcome).toBe('direct_support')
    expect(noTransport.exactContext.enabled).toBe(false)
    expect(noTransport.currentTransport.enabled).toBe(false)
  })

  it('keeps inferred-return-only matches in audit provenance and out of ranking', () => {
    const returnInput = { ...input, tempOut: 20, tempBack: 33 }
    const evidence = calculateDirectEvidence(
      [
        wear('inferred', 20, null, {
          tempBack: 33,
          tempBackInferred: true,
          feelingBack: 'hot',
        }),
      ],
      returnInput,
    )

    expect(evidence.exactContext.outcome).toBe('unknown')
    expect(evidence.exactContext.observations).toEqual([])
    expect(evidence.exactContext.auditObservations).toEqual([
      expect.objectContaining({
        wearLogId: 'inferred',
        endpoint: 'return',
        inferredReturn: true,
        rankingEligible: false,
      }),
    ])
    expect(evidence.exactContext.inferredReturnAuditObservationCount).toBe(1)
  })

  it('uses an actual return only against the explicit current return endpoint', () => {
    const evidence = calculateDirectEvidence(
      [
        wear('actual-return', 20, null, {
          tempBack: 31,
          tempBackInferred: false,
          feelingBack: 'ok',
        }),
      ],
      { ...input, tempOut: 20, tempBack: 33 },
    )

    expect(evidence.exactContext).toMatchObject({
      outcome: 'direct_support',
      confidence: 'observed-once',
      observationCount: 1,
    })
    expect(evidence.exactContext.observations[0]).toMatchObject({
      endpoint: 'return',
      currentTemperature: 33,
      historicalTemperature: 31,
      inferredReturn: false,
    })
  })

  it('never treats historical null Transport as a specific Transport match', () => {
    const evidence = calculateDirectEvidence(
      [wear('null-transport', 33, 'hot', { transportModeId: null })],
      input,
    )

    expect(evidence.exactContext.outcome).toBe('unknown')
    expect(evidence.currentTransport.outcome).toBe('unknown')
  })

  it('does not manufacture a return endpoint when current tempBack is null', () => {
    const evidence = calculateDirectEvidence(
      [
        wear('return-only', 20, null, {
          tempBack: 33,
          tempBackInferred: false,
          feelingBack: 'ok',
        }),
      ],
      input,
    )

    expect(evidence.exactContext.auditObservations).toEqual([])
  })

  it('is deterministic across input order and duplicate rows', () => {
    const first = wear('a', 33, 'ok')
    const second = wear('b', 34, 'ok')

    expect(calculateDirectEvidence([first, second, first], input)).toEqual(
      calculateDirectEvidence([second, first], input),
    )
  })
})

function evidence(outcome: DirectEvidence['exactContext']['outcome']): DirectEvidence {
  const log =
    outcome === 'direct_support'
      ? wear(`log-${outcome}`, 33, 'ok')
      : outcome === 'direct_issue'
        ? wear(`log-${outcome}`, 33, 'hot')
        : outcome === 'mixed'
          ? [wear('log-ok', 33, 'ok'), wear('log-hot', 33, 'hot')]
          : []
  return calculateDirectEvidence(Array.isArray(log) ? log : [log], input)
}

function candidate(
  id: string,
  baselineOrder: number,
  outcome: DirectEvidence['exactContext']['outcome'],
  level: RecommendationLevel = 'high',
): DirectEvidencePolicyCandidate<string> {
  return { id, baselineOrder, level, evidence: evidence(outcome), value: id }
}

describe('Policy E bounded group simulation', () => {
  it('keeps E0 report-only and E1 support/mixed/unknown in baseline order', () => {
    const candidates = [
      candidate('unknown', 0, 'unknown'),
      candidate('support', 1, 'direct_support'),
      candidate('mixed', 2, 'mixed'),
    ]

    expect(
      simulateDirectEvidenceGroup(candidates, 'E0', 5).ordered.map(
        (entry) => entry.id,
      ),
    ).toEqual(['unknown', 'support', 'mixed'])
    expect(
      simulateDirectEvidenceGroup(candidates, 'E1', 5).ordered.map(
        (entry) => entry.id,
      ),
    ).toEqual(['unknown', 'support', 'mixed'])
  })

  it('moves only direct issues down in E1 and bounds movement at 1, 3, and 5', () => {
    const candidates = [
      candidate('issue', 0, 'direct_issue'),
      ...Array.from({ length: 6 }, (_, index) =>
        candidate(`neutral-${index}`, index + 1, 'unknown'),
      ),
    ]

    for (const cap of [1, 3, 5] as const) {
      const result = simulateDirectEvidenceGroup(candidates, 'E1', cap)
      const issue = result.ordered.find((entry) => entry.id === 'issue')
      expect(issue?.movement).toBe(cap)
      expect(result.maximumIndividualMovement).toBe(cap)
    }
  })

  it('moves direct support up and direct issue down in E2 without crossing levels', () => {
    const result = simulateDirectEvidenceGroup(
      [
        candidate('issue-high', 0, 'direct_issue', 'high'),
        candidate('neutral-high', 1, 'unknown', 'high'),
        candidate('support-high', 2, 'direct_support', 'high'),
        candidate('support-possible', 3, 'direct_support', 'possible'),
      ],
      'E2',
      3,
    )

    expect(result.ordered.map((entry) => entry.id)).toEqual([
      'support-high',
      'neutral-high',
      'issue-high',
      'support-possible',
    ])
    expect(result.ordered.find((entry) => entry.id === 'support-possible')?.movement).toBe(0)
  })

  it('preserves recent-purchase, recommendation, and trial membership', () => {
    const resultFor = (id: string, level: RecommendationLevel) =>
      ({ outfit: { id }, level }) as RecommendationResult
    const recent = resultFor('recent', 'high')
    const normal = resultFor('normal', 'high')
    const trial = resultFor('trial', 'possible')
    const groups = {
      recentPurchases: [recent],
      recommendations: [normal],
      trialRecommendations: [trial],
    }
    const evidenceById = new Map([
      ['recent', evidence('direct_issue')],
      ['normal', evidence('direct_support')],
      ['trial', evidence('direct_support')],
    ])
    const simulation = simulateDirectEvidencePartitions(
      groups,
      evidenceById,
      'E2',
      5,
    )

    expect(simulation.groups).toEqual(groups)
    expect(simulation.groupMembershipChanges).toBe(0)
  })

  it('reorders the same result objects without changing warnings or membership', () => {
    const issue = {
      outfit: { id: 'issue' },
      level: 'high',
      warnings: ['기존 경고'],
    } as unknown as RecommendationResult
    const neutral = {
      outfit: { id: 'neutral' },
      level: 'high',
      warnings: [],
    } as unknown as RecommendationResult
    const simulation = simulateDirectEvidencePartitions(
      {
        recentPurchases: [],
        recommendations: [issue, neutral],
        trialRecommendations: [],
      },
      new Map([
        ['issue', evidence('direct_issue')],
        ['neutral', evidence('unknown')],
      ]),
      'E1',
      1,
    )

    expect(simulation.groups.recommendations).toEqual([neutral, issue])
    expect(simulation.groups.recommendations[1]).toBe(issue)
    expect(simulation.groups.recommendations[1].warnings).toEqual(['기존 경고'])
    expect(simulation.groupMembershipChanges).toBe(0)
  })
})
