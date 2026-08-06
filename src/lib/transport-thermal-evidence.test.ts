import { describe, expect, it } from 'vitest'
import { phase5BaselineWearLog } from './fixtures/phase5-recommendation-baseline'
import {
  calculateTransportThermalEvidence,
  calculateTransportThermalSensitivity,
} from './transport-thermal-evidence.mjs'

const walkInput = {
  outfitId: 'outfit-a',
  tempOut: 33,
  tempBack: null,
  placeId: 'place-cafe',
  transportModeId: 'transport-walk',
  longWalkCondition: 'no' as const,
}

function failureCaseLogs() {
  return [
    phase5BaselineWearLog('walk-24', 'outfit-a', '2026-06-01', {
      tempOut: 24,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'place-cafe',
      transportModeId: 'transport-walk',
    }),
    phase5BaselineWearLog('car-28', 'outfit-a', '2026-06-02', {
      tempOut: 28,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'place-cafe',
      transportModeId: 'transport-car',
    }),
    phase5BaselineWearLog('car-33', 'outfit-a', '2026-06-03', {
      tempOut: 33,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'place-cafe',
      transportModeId: 'transport-car',
    }),
  ]
}

describe('calculateTransportThermalEvidence', () => {
  it('exposes the anonymized 33°C Walk failure pattern without asserting policy', () => {
    const result = calculateTransportThermalEvidence(
      failureCaseLogs(),
      walkInput,
    )

    expect(result.overall.rawOkTemperatures).toEqual([24, 28, 33])
    expect(result.overall.expandedOkRange).toEqual({ min: 22, max: 35 })
    expect(result.currentTransport?.expandedOkRange).toEqual({
      min: 22,
      max: 26,
    })
    expect(result.targetWithinOverallOkRange).toBe(true)
    expect(result.targetWithinCurrentTransportOkRange).toBe(false)
    expect(result.overallSupportOnlyFromOtherTransport).toBe(true)
    expect(result.overallHighEndpointBorrowedFromOtherTransport).toBe(true)
    expect(
      result.otherTransports[0]?.evidence.observations
        .filter((entry) => entry.temperature === 33)
        .map((entry) => entry.wearLogId),
    ).toEqual(['car-33'])
  })

  it('supports 33°C when the current Transport is Car', () => {
    const result = calculateTransportThermalEvidence(failureCaseLogs(), {
      ...walkInput,
      transportModeId: 'transport-car',
    })

    expect(result.currentTransport?.expandedOkRange).toEqual({
      min: 26,
      max: 35,
    })
    expect(result.targetWithinCurrentTransportOkRange).toBe(true)
    expect(result.overallSupportOnlyFromOtherTransport).toBe(false)
  })

  it('keeps historical null Transport separate and disables current matching when Transport is null', () => {
    const logs = [
      ...failureCaseLogs(),
      phase5BaselineWearLog('null-30', 'outfit-a', '2026-06-04', {
        tempOut: 30,
        tempBack: null,
        feelingOut: 'ok',
        feelingBack: null,
        transportModeId: null,
      }),
    ]
    const result = calculateTransportThermalEvidence(logs, {
      ...walkInput,
      transportModeId: null,
    })

    expect(result.currentTransport).toBeNull()
    expect(result.exactContext).toBeNull()
    expect(result.targetWithinCurrentTransportOkRange).toBeNull()
    expect(result.nullTransport.matchedWearLogIds).toEqual(['null-30'])
    expect(result.nullTransport.rawOkTemperatures).toEqual([30])
  })

  it('preserves overall, current Transport, current Place, and exact-context scopes', () => {
    const logs = [
      ...failureCaseLogs(),
      phase5BaselineWearLog('walk-other-place', 'outfit-a', '2026-06-04', {
        tempOut: 26,
        tempBack: 27,
        tempBackInferred: true,
        feelingOut: 'ok',
        feelingBack: 'hot',
        placeId: 'place-library',
        transportModeId: 'transport-walk',
      }),
    ]
    const result = calculateTransportThermalEvidence(logs, walkInput)

    expect(result.overall.rawOkRange).toEqual({ min: 24, max: 33 })
    expect(result.currentTransport?.rawOkTemperatures).toEqual([24, 26])
    expect(result.currentPlace?.rawOkTemperatures).toEqual([24, 28, 33])
    expect(result.exactContext?.rawOkTemperatures).toEqual([24])
    expect(result.currentTransport?.sourcePlaceIds).toEqual([
      'place-cafe',
      'place-library',
    ])
    expect(result.currentPlace?.sourceTransportIds).toEqual([
      'transport-car',
      'transport-walk',
    ])
    expect(result.currentTransport?.hotObservations).toHaveLength(1)
    expect(result.currentTransport?.inferredReturnEndpointCount).toBe(1)
    expect(result.exactContext?.targetWithinRange).toBe(false)
  })

  it('disables Place and exact scopes when current Place is null', () => {
    const result = calculateTransportThermalEvidence(failureCaseLogs(), {
      ...walkInput,
      placeId: null,
    })

    expect(result.currentTransport).not.toBeNull()
    expect(result.currentPlace).toBeNull()
    expect(result.exactContext).toBeNull()
  })

  it('does not label evidence as other-Transport-only when null Transport also supplies it', () => {
    const logs = [
      ...failureCaseLogs(),
      phase5BaselineWearLog('null-33', 'outfit-a', '2026-06-04', {
        tempOut: 33,
        tempBack: null,
        feelingOut: 'ok',
        feelingBack: null,
        transportModeId: null,
      }),
    ]
    const result = calculateTransportThermalEvidence(logs, walkInput)

    expect(result.targetWithinOverallOkRange).toBe(true)
    expect(result.targetWithinCurrentTransportOkRange).toBe(false)
    expect(result.overallSupportOnlyFromOtherTransport).toBe(false)
    expect(result.overallHighEndpointBorrowedFromOtherTransport).toBe(false)
  })

  it('traces cold and hot warnings to current, other, and null Transport separately', () => {
    const logs = [
      phase5BaselineWearLog('walk-ok', 'outfit-a', '2026-01-01', {
        tempOut: 25,
        feelingOut: 'ok',
        transportModeId: 'transport-walk',
      }),
      phase5BaselineWearLog('car-hot', 'outfit-a', '2026-01-02', {
        tempOut: 30,
        feelingOut: 'hot',
        transportModeId: 'transport-car',
      }),
      phase5BaselineWearLog('car-cold', 'outfit-a', '2026-01-03', {
        tempOut: 20,
        feelingOut: 'cold',
        transportModeId: 'transport-car',
      }),
    ]

    const hot = calculateTransportThermalEvidence(logs, {
      ...walkInput,
      tempOut: 31,
    })
    expect(hot.hotWarningSupportedByCurrentTransport).toBe(false)
    expect(hot.warnings.hot.otherTransportSourceWearLogIds).toEqual([
      'car-hot',
    ])
    expect(hot.warningWouldComeOnlyFromOtherTransport).toBe(true)

    const cold = calculateTransportThermalEvidence(logs, {
      ...walkInput,
      tempOut: 19,
    })
    expect(cold.coldWarningSupportedByCurrentTransport).toBe(false)
    expect(cold.warnings.cold.otherTransportSourceWearLogIds).toEqual([
      'car-cold',
    ])
  })

  it('counts a Wear Log once and deduplicates identical out/back observations', () => {
    const duplicated = phase5BaselineWearLog(
      'same-log',
      'outfit-a',
      '2026-01-01',
      {
        tempOut: 24,
        tempBack: 24,
        feelingOut: 'ok',
        feelingBack: 'ok',
        transportModeId: 'transport-walk',
      },
    )
    const result = calculateTransportThermalEvidence(
      [duplicated, duplicated],
      walkInput,
    )

    expect(result.overall.observationCount).toBe(1)
    expect(result.overall.distinctWearLogCount).toBe(1)
    expect(result.overall.matchedWearLogIds).toEqual(['same-log'])
  })

  it('excludes only inferred return endpoints in the higher-confidence sensitivity pass', () => {
    const logs = [
      phase5BaselineWearLog('observed-out', 'outfit-a', '2026-01-01', {
        tempOut: 24,
        tempBack: 33,
        tempBackInferred: true,
        feelingOut: 'ok',
        feelingBack: 'ok',
        transportModeId: 'transport-walk',
      }),
    ]
    const result = calculateTransportThermalSensitivity(logs, walkInput)

    expect(result.baselineCompatible.overall.rawOkTemperatures).toEqual([
      24,
      33,
    ])
    expect(result.higherConfidence.overall.rawOkTemperatures).toEqual([24])
    expect(result.baselineCompatible.overall.matchedWearLogIds).toEqual([
      'observed-out',
    ])
    expect(result.higherConfidence.overall.matchedWearLogIds).toEqual([
      'observed-out',
    ])
  })

  it('does not substitute longWalkCondition for Transport evidence', () => {
    const noLongWalk = calculateTransportThermalEvidence(
      failureCaseLogs(),
      walkInput,
    )
    const longWalk = calculateTransportThermalEvidence(failureCaseLogs(), {
      ...walkInput,
      longWalkCondition: 'yes',
    })

    expect(longWalk).toEqual(noLongWalk)
  })

  it('is deterministic when the input array order changes', () => {
    const logs = failureCaseLogs()
    expect(
      calculateTransportThermalEvidence([...logs].reverse(), walkInput),
    ).toEqual(calculateTransportThermalEvidence(logs, walkInput))
  })
})
