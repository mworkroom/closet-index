import { describe, expect, it } from 'vitest'
import type { ReplacementLineOverviewRow } from './replacement-line-overview'
import {
  getCompletedCalendarYears,
  getReplacementLineRiskThreshold,
  getReplacementLineSurvivalStatus,
} from './replacement-line-survival'

type SurvivalInput = Pick<
  ReplacementLineOverviewRow,
  | 'styleIdentity'
  | 'lifecycleStatus'
  | 'activeItems'
  | 'retiredItems'
  | 'newestActiveAcquiredOn'
  | 'hiddenMembershipCount'
>

function line(options: Partial<SurvivalInput> = {}): SurvivalInput {
  return {
    styleIdentity: null,
    lifecycleStatus: 'active',
    activeItems: [{} as ReplacementLineOverviewRow['activeItems'][number]],
    retiredItems: [],
    newestActiveAcquiredOn: '2026-08-06',
    hiddenMembershipCount: 0,
    ...options,
  }
}

describe('Replacement Line survival status', () => {
  it('normalizes Style Identity and uses the first matching threshold', () => {
    expect(getReplacementLineRiskThreshold('  Travel BAG  ')).toBe(5)
    expect(getReplacementLineRiskThreshold('Walking Shoes')).toBe(4)
    expect(getReplacementLineRiskThreshold('Bag Shoes')).toBe(5)
    expect(getReplacementLineRiskThreshold('Shoes Socks')).toBe(4)
    expect(getReplacementLineRiskThreshold('Layered\tTop Tee')).toBe(2)
    expect(getReplacementLineRiskThreshold('Everyday TEE')).toBe(2)
    expect(getReplacementLineRiskThreshold('Warm Socks')).toBe(1)
    expect(getReplacementLineRiskThreshold('Daily Uniform')).toBe(3)
  })

  it('counts only completed calendar years at the anniversary boundary', () => {
    expect(getCompletedCalendarYears('2024-08-07', '2026-08-06')).toBe(1)
    expect(getCompletedCalendarYears('2024-08-06', '2026-08-06')).toBe(2)
    expect(getCompletedCalendarYears('2027-01-01', '2026-08-06')).toBeNull()
    expect(getCompletedCalendarYears('not-a-date', '2026-08-06')).toBeNull()
  })

  it('prioritizes extinction when a non-empty Line has no Active Item', () => {
    expect(
      getReplacementLineSurvivalStatus(
        line({
          activeItems: [],
          retiredItems: [
            {} as ReplacementLineOverviewRow['retiredItems'][number],
          ],
          newestActiveAcquiredOn: null,
        }),
        '2026-08-06',
      ),
    ).toMatchObject({
      kind: 'extinct',
      label: '💀 멸종',
      newestActiveAgeYears: null,
    })
  })

  it('uses the newest Active age for endangered and replacement-check signals', () => {
    expect(
      getReplacementLineSurvivalStatus(
        line({
          styleIdentity: 'Shoes',
          newestActiveAcquiredOn: '2022-08-06',
        }),
        '2026-08-06',
      ),
    ).toMatchObject({
      kind: 'endangered',
      newestActiveAgeYears: 4,
      riskThresholdYears: 4,
    })

    expect(
      getReplacementLineSurvivalStatus(
        line({
          styleIdentity: 'Bag',
          newestActiveAcquiredOn: '2022-08-06',
        }),
        '2026-08-06',
      ),
    ).toMatchObject({
      kind: 'replacement_check',
      newestActiveAgeYears: 4,
      riskThresholdYears: 5,
    })
  })

  it('keeps the Socks zero-year check and one-year endangered boundary', () => {
    expect(
      getReplacementLineSurvivalStatus(
        line({ styleIdentity: 'Socks', newestActiveAcquiredOn: '2026-08-06' }),
        '2026-08-06',
      )?.kind,
    ).toBe('replacement_check')
    expect(
      getReplacementLineSurvivalStatus(
        line({ styleIdentity: 'Socks', newestActiveAcquiredOn: '2025-08-06' }),
        '2026-08-06',
      )?.kind,
    ).toBe('endangered')
  })

  it('shows no signal for safe, empty, undated, hidden, or archived Lines', () => {
    expect(
      getReplacementLineSurvivalStatus(
        line({ newestActiveAcquiredOn: '2025-08-06' }),
        '2026-08-06',
      ),
    ).toBeNull()
    expect(
      getReplacementLineSurvivalStatus(
        line({ activeItems: [], retiredItems: [], newestActiveAcquiredOn: null }),
        '2026-08-06',
      ),
    ).toBeNull()
    expect(
      getReplacementLineSurvivalStatus(
        line({ newestActiveAcquiredOn: null }),
        '2026-08-06',
      ),
    ).toBeNull()
    expect(
      getReplacementLineSurvivalStatus(
        line({
          activeItems: [],
          retiredItems: [],
          newestActiveAcquiredOn: null,
          hiddenMembershipCount: 1,
        }),
        '2026-08-06',
      ),
    ).toBeNull()
    expect(
      getReplacementLineSurvivalStatus(
        line({
          newestActiveAcquiredOn: '2020-08-06',
          hiddenMembershipCount: 1,
        }),
        '2026-08-06',
      ),
    ).toBeNull()
    expect(
      getReplacementLineSurvivalStatus(
        line({ lifecycleStatus: 'archived' }),
        '2026-08-06',
      ),
    ).toBeNull()
  })
})
