import { describe, expect, it } from 'vitest'
import { phase5BaselineWearLog } from './fixtures/phase5-recommendation-baseline'
import { calculateTransportThermalEvidence } from './transport-thermal-evidence.mjs'
import {
  evaluateTransportThermalPolicy,
  simulateTransportThermalPolicy,
  TRANSPORT_THERMAL_POLICIES,
} from './transport-thermal-policy.mjs'

const walkInput = {
  outfitId: 'outfit-failure',
  tempOut: 33,
  tempBack: null,
  placeId: 'place-cafe',
  transportModeId: 'transport-walk',
  longWalkCondition: 'no' as const,
}

function wear(
  id: string,
  outfitId: string,
  temperature: number,
  transportModeId: string | null,
  feeling: 'cold' | 'ok' | 'hot',
  overrides: Record<string, unknown> = {},
) {
  return phase5BaselineWearLog(id, outfitId, '2026-06-01', {
    tempOut: temperature,
    tempBack: null,
    feelingOut: feeling,
    feelingBack: null,
    placeId: 'place-cafe',
    transportModeId,
    ...overrides,
  })
}

function failureLogs(outfitId = 'outfit-failure') {
  return [
    wear('walk-24', outfitId, 24, 'transport-walk', 'ok'),
    wear('car-28', outfitId, 28, 'transport-car', 'ok'),
    wear('car-33', outfitId, 33, 'transport-car', 'ok'),
  ]
}

function evidence(
  outfitId: string,
  logs: ReturnType<typeof failureLogs>,
  overrides: Partial<typeof walkInput> = {},
) {
  return calculateTransportThermalEvidence(logs, {
    ...walkInput,
    outfitId,
    ...overrides,
  })
}

describe('disabled Transport thermal policy simulations', () => {
  it('compares the 33°C Walk failure without encoding a permanent policy', () => {
    const result = evidence('outfit-failure', failureLogs())
    const decisions = Object.fromEntries(
      TRANSPORT_THERMAL_POLICIES.map((policy) => [
        policy,
        evaluateTransportThermalPolicy(policy, result, walkInput),
      ]),
    )

    expect(decisions['report-only']).toMatchObject({
      status: 'borrowed-only',
      rankAdjustment: 0,
    })
    expect(decisions['weak-1-strong-2']).toMatchObject({
      status: 'borrowed-only',
      confidence: 'transport-weak',
      rankAdjustment: 1,
    })
    expect(decisions['minimum-2']).toMatchObject({
      status: 'borrowed-only',
      confidence: 'informational',
      rankAdjustment: 0,
    })
    expect(decisions['exact-context-only']).toMatchObject({
      confidence: 'informational',
      rankAdjustment: 0,
    })
  })

  it('treats the same fixture as exact supported when Transport changes to Car', () => {
    const input = { ...walkInput, transportModeId: 'transport-car' }
    const result = evidence('outfit-failure', failureLogs(), input)

    expect(result.currentTransport?.distinctWearLogCount).toBe(2)
    expect(result.exactContext?.distinctWearLogCount).toBe(2)
    expect(result.exactContext?.targetWithinRange).toBe(true)
    expect(
      evaluateTransportThermalPolicy('weak-1-strong-2', result, input),
    ).toMatchObject({ status: 'supported', confidence: 'exact-strong' })
  })

  it('keeps zero current-Transport evidence unknown with no rank effect', () => {
    const logs = [wear('car-only', 'outfit-unknown', 33, 'transport-car', 'ok')]
    const result = evidence('outfit-unknown', logs)

    for (const policy of TRANSPORT_THERMAL_POLICIES) {
      expect(evaluateTransportThermalPolicy(policy, result, {
        ...walkInput,
        outfitId: 'outfit-unknown',
      }).rankAdjustment).toBe(0)
    }
  })

  it('distinguishes one exact log from two current-Transport logs', () => {
    const logs = [
      wear('walk-cafe', 'outfit-current-two', 24, 'transport-walk', 'ok'),
      wear('walk-library', 'outfit-current-two', 33, 'transport-walk', 'ok', {
        placeId: 'place-library',
      }),
    ]
    const result = evidence('outfit-current-two', logs)

    expect(result.currentTransport?.distinctWearLogCount).toBe(2)
    expect(result.exactContext?.distinctWearLogCount).toBe(1)
    expect(
      evaluateTransportThermalPolicy('weak-1-strong-2', result, {
        ...walkInput,
        outfitId: 'outfit-current-two',
      }),
    ).toMatchObject({ confidence: 'transport-strong', rankAdjustment: 0 })
  })

  it('gives two exact successes stronger confidence than cross-Place support', () => {
    const exactLogs = [
      wear('exact-1', 'outfit-exact', 32, 'transport-walk', 'ok'),
      wear('exact-2', 'outfit-exact', 33, 'transport-walk', 'ok'),
    ]
    const result = evidence('outfit-exact', exactLogs)

    expect(
      evaluateTransportThermalPolicy('minimum-2', result, {
        ...walkInput,
        outfitId: 'outfit-exact',
      }),
    ).toMatchObject({ confidence: 'exact-strong', rankAdjustment: 0 })
  })

  it('marks repeated exact success and issue as warning evidence', () => {
    const logs = [
      wear('mixed-ok', 'outfit-mixed', 33, 'transport-walk', 'ok'),
      wear('mixed-hot', 'outfit-mixed', 32, 'transport-walk', 'hot'),
    ]
    const result = evidence('outfit-mixed', logs)

    expect(
      evaluateTransportThermalPolicy('weak-1-strong-2', result, {
        ...walkInput,
        outfitId: 'outfit-mixed',
      }),
    ).toMatchObject({ status: 'current-warning', rankAdjustment: 0 })
  })

  it('isolates inferred-return-only borrowing to the baseline-compatible evidence', () => {
    const logs = [
      wear('walk-ok', 'outfit-inferred', 24, 'transport-walk', 'ok'),
      wear('car-inferred', 'outfit-inferred', 28, 'transport-car', 'ok', {
        tempBack: 33,
        tempBackInferred: true,
        feelingBack: 'ok',
      }),
    ]
    const input = { ...walkInput, outfitId: 'outfit-inferred' }
    const baseline = calculateTransportThermalEvidence(logs, input)
    const higherConfidence = calculateTransportThermalEvidence(logs, input, {
      includeInferredReturnObservations: false,
    })

    expect(baseline.overallSupportOnlyFromOtherTransport).toBe(true)
    expect(higherConfidence.overallSupportOnlyFromOtherTransport).toBe(false)
  })

  it('preserves level boundaries, warnings, and baseline order as fallback', () => {
    const supported = evidence(
      'outfit-supported',
      [wear('walk-33', 'outfit-supported', 33, 'transport-walk', 'ok')],
    )
    const borrowed = evidence('outfit-failure', failureLogs())
    const exact = evidence(
      'outfit-exact',
      [
        wear('exact-1', 'outfit-exact', 32, 'transport-walk', 'ok'),
        wear('exact-2', 'outfit-exact', 33, 'transport-walk', 'ok'),
      ],
    )
    const warned = evidence(
      'outfit-warned',
      [wear('walk-hot', 'outfit-warned', 30, 'transport-walk', 'hot')],
    )
    const candidates = [
      { id: 'supported', level: 'high' as const, baselineOrder: 0, evidence: supported },
      { id: 'borrowed', level: 'high' as const, baselineOrder: 1, evidence: borrowed },
      { id: 'exact', level: 'high' as const, baselineOrder: 2, evidence: exact },
      {
        id: 'warned',
        level: 'caution' as const,
        baselineOrder: 3,
        evidence: warned,
        warnings: ['기존 더움 경고'],
      },
    ]

    const reportOnly = simulateTransportThermalPolicy(
      'report-only',
      [...candidates].reverse(),
      walkInput,
    )
    expect(reportOnly.map((entry) => entry.id)).toEqual([
      'supported',
      'borrowed',
      'exact',
      'warned',
    ])

    const policyB = simulateTransportThermalPolicy(
      'weak-1-strong-2',
      [...candidates].reverse(),
      walkInput,
    )
    expect(policyB.map((entry) => entry.id)).toEqual([
      'supported',
      'exact',
      'borrowed',
      'warned',
    ])
    expect(policyB.at(-1)?.warnings).toEqual(['기존 더움 경고'])
    expect(policyB.at(-1)?.level).toBe('caution')
  })

  it('is deterministic for equal policy and fallback values', () => {
    const result = evidence('outfit-failure', failureLogs())
    const candidates = [
      { id: 'b', level: 'high' as const, baselineOrder: 0, evidence: result },
      { id: 'a', level: 'high' as const, baselineOrder: 0, evidence: result },
    ]

    expect(
      simulateTransportThermalPolicy('report-only', candidates, walkInput).map(
        (entry) => entry.id,
      ),
    ).toEqual(['a', 'b'])
    expect(
      simulateTransportThermalPolicy(
        'report-only',
        [...candidates].reverse(),
        walkInput,
      ).map((entry) => entry.id),
    ).toEqual(['a', 'b'])
  })
})
