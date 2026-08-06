import { describe, expect, it } from 'vitest'
import {
  activeContextEvidenceBucket,
  calculateContextEvidence,
} from './context-evidence'
import { phase5BaselineWearLog } from './fixtures/phase5-recommendation-baseline'

const current = {
  placeId: 'place-a',
  transportModeId: 'transport-a',
}

describe('calculateContextEvidence', () => {
  it('keeps exact and Place-only matched Wear Log IDs mutually exclusive', () => {
    const evidence = calculateContextEvidence(
      [
        phase5BaselineWearLog('exact-2', 'outfit-a', '2026-01-02'),
        phase5BaselineWearLog('exact-1', 'outfit-a', '2026-01-01'),
        phase5BaselineWearLog('other-transport', 'outfit-a', '2026-01-03', {
          transportModeId: 'transport-b',
        }),
        phase5BaselineWearLog('missing-transport', 'outfit-a', '2026-01-04', {
          transportModeId: null,
        }),
        phase5BaselineWearLog('other-place', 'outfit-a', '2026-01-05', {
          placeId: 'place-b',
        }),
      ],
      current,
    )

    expect(evidence.exact.matchedWearLogIds).toEqual(['exact-1', 'exact-2'])
    expect(evidence.placeOnly.matchedWearLogIds).toEqual([
      'missing-transport',
      'other-transport',
    ])
    expect(evidence.independent.placeMatchedWearLogIds).toEqual([
      'exact-1',
      'exact-2',
      'missing-transport',
      'other-transport',
    ])
    expect(evidence.independent.transportMatchedWearLogIds).toEqual([
      'exact-1',
      'exact-2',
      'other-place',
    ])
    expect(
      evidence.exact.matchedWearLogIds.some((id) =>
        evidence.placeOnly.matchedWearLogIds.includes(id),
      ),
    ).toBe(false)
    expect(evidence.activeTier).toBe('exact')
  })

  it('never treats historical null Transport as an exact match', () => {
    const evidence = calculateContextEvidence(
      [
        phase5BaselineWearLog('null-transport', 'outfit-a', '2026-01-01', {
          transportModeId: null,
        }),
      ],
      current,
      { threshold: 1 },
    )

    expect(evidence.exact.exposureCount).toBe(0)
    expect(evidence.placeOnly.matchedWearLogIds).toEqual(['null-transport'])
    expect(evidence.activeTier).toBe('place')
  })

  it('disables exact ranking when current Transport is missing', () => {
    const evidence = calculateContextEvidence(
      [
        phase5BaselineWearLog('transport-a', 'outfit-a', '2026-01-01'),
        phase5BaselineWearLog('transport-b', 'outfit-a', '2026-01-02', {
          transportModeId: 'transport-b',
        }),
      ],
      { placeId: 'place-a', transportModeId: null },
    )

    expect(evidence.exact.enabled).toBe(false)
    expect(evidence.exact.matchedWearLogIds).toEqual([])
    expect(evidence.placeOnly.matchedWearLogIds).toEqual([
      'transport-a',
      'transport-b',
    ])
    expect(evidence.activeTier).toBe('place')
  })

  it('disables both tiers when current Place is missing', () => {
    const evidence = calculateContextEvidence(
      [phase5BaselineWearLog('log-1', 'outfit-a', '2026-01-01')],
      { placeId: null, transportModeId: 'transport-a' },
      { threshold: 1 },
    )

    expect(evidence.exact.enabled).toBe(false)
    expect(evidence.placeOnly.enabled).toBe(false)
    expect(evidence.activeTier).toBe('none')
    expect(activeContextEvidenceBucket(evidence)).toBeNull()
  })

  it('distinguishes exposure, success, issue, unknown, cold, and hot', () => {
    const duplicate = phase5BaselineWearLog(
      'success',
      'outfit-a',
      '2026-01-01',
    )
    const evidence = calculateContextEvidence(
      [
        duplicate,
        duplicate,
        phase5BaselineWearLog('cold', 'outfit-a', '2026-01-02', {
          feelingOut: 'cold',
          feelingBack: null,
        }),
        phase5BaselineWearLog('hot', 'outfit-a', '2026-01-03', {
          feelingOut: 'ok',
          feelingBack: 'hot',
        }),
        phase5BaselineWearLog('unknown', 'outfit-a', '2026-01-04', {
          feelingOut: null,
          feelingBack: null,
          tempOut: null,
          tempBack: null,
        }),
        phase5BaselineWearLog('cold-hot', 'outfit-a', '2026-01-05', {
          feelingOut: 'cold',
          feelingBack: 'hot',
        }),
      ],
      current,
    )

    expect(evidence.exact).toMatchObject({
      exposureCount: 5,
      successCount: 1,
      issueCount: 3,
      unknownCount: 1,
      coldCount: 2,
      hotCount: 2,
    })
  })

  it('uses Place-only only as fallback when exact is below the threshold', () => {
    const logs = [
      phase5BaselineWearLog('exact-1', 'outfit-a', '2026-01-01'),
      phase5BaselineWearLog('place-1', 'outfit-a', '2026-01-02', {
        transportModeId: 'transport-b',
      }),
      phase5BaselineWearLog('place-2', 'outfit-a', '2026-01-03', {
        transportModeId: null,
      }),
    ]

    const fallback = calculateContextEvidence(logs, current)
    expect(fallback.activeTier).toBe('place')
    expect(activeContextEvidenceBucket(fallback)?.exposureCount).toBe(2)

    const exact = calculateContextEvidence(
      [
        ...logs,
        phase5BaselineWearLog('exact-2', 'outfit-a', '2026-01-04'),
      ],
      current,
    )
    expect(exact.activeTier).toBe('exact')
    expect(activeContextEvidenceBucket(exact)?.exposureCount).toBe(2)
  })

  it('rejects invalid thresholds', () => {
    expect(() =>
      calculateContextEvidence([], current, { threshold: 0 }),
    ).toThrow('positive integer')
  })
})
