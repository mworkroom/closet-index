import { describe, expect, it } from 'vitest'
import type { WearLog } from '../lib/types'
import {
  DEFAULT_WEAR_LOG_EDITOR_FILTERS,
  filterAndSortWearLogRows,
  isWalkTransportName,
  mergeWearLogPatch,
} from './wear-log-editor'

const baseLog: WearLog = {
  id: 'log-1',
  outfitId: 'outfit-1',
  wornOn: '2026-08-01',
  tempOut: 28,
  tempBack: 26,
  tempBackInferred: false,
  feelingOut: 'ok',
  feelingBack: 'ok',
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'place-1',
  transportModeId: 'transport-walk',
  observedHvacMode: 'off',
  observedHvacIntensity: null,
  memo: 'nearby',
  temperatureSource: 'manual',
  weatherLocationId: null,
  weatherIssuedAt: null,
  weatherOverridden: false,
  submissionToken: 'token-1',
  createdAt: '2026-08-01T00:00:00.000Z',
}

describe('Wear Log Editor helpers', () => {
  it('recognizes English and Korean walk transport labels', () => {
    expect(isWalkTransportName('Walk')).toBe(true)
    expect(isWalkTransportName('도보')).toBe(true)
    expect(isWalkTransportName('지하철')).toBe(false)
  })

  it('filters walk and missing transport rows and sorts newest first', () => {
    const rows = [
      { log: baseLog, outfitName: 'Blue outfit', placeName: 'Cafe', transportName: 'Walk' },
      {
        log: { ...baseLog, id: 'log-2', wornOn: '2026-08-03', transportModeId: null },
        outfitName: 'Black outfit',
        placeName: 'Library',
        transportName: '',
      },
    ]

    expect(
      filterAndSortWearLogRows(rows, {
        ...DEFAULT_WEAR_LOG_EDITOR_FILTERS,
        walkFilter: 'walk',
      }).map((row) => row.log.id),
    ).toEqual(['log-1'])
    expect(
      filterAndSortWearLogRows(rows, {
        ...DEFAULT_WEAR_LOG_EDITOR_FILTERS,
        walkFilter: 'missing',
      }).map((row) => row.log.id),
    ).toEqual(['log-2'])
    expect(
      filterAndSortWearLogRows(rows, DEFAULT_WEAR_LOG_EDITOR_FILTERS).map(
        (row) => row.log.id,
      ),
    ).toEqual(['log-2', 'log-1'])
  })

  it('filters rain and long-walk conditions independently', () => {
    const rows = [
      {
        log: {
          ...baseLog,
          id: 'log-rain',
          rainCondition: 'yes' as const,
          longWalkCondition: 'no' as const,
        },
        outfitName: 'Rain outfit',
        placeName: 'Cafe',
        transportName: 'Car',
      },
      {
        log: {
          ...baseLog,
          id: 'log-walk',
          rainCondition: 'no' as const,
          longWalkCondition: 'yes' as const,
        },
        outfitName: 'Walk outfit',
        placeName: 'Park',
        transportName: 'Walk',
      },
    ]

    expect(
      filterAndSortWearLogRows(rows, {
        ...DEFAULT_WEAR_LOG_EDITOR_FILTERS,
        rainCondition: 'yes',
      }).map((row) => row.log.id),
    ).toEqual(['log-rain'])
    expect(
      filterAndSortWearLogRows(rows, {
        ...DEFAULT_WEAR_LOG_EDITOR_FILTERS,
        longWalkCondition: 'yes',
      }).map((row) => row.log.id),
    ).toEqual(['log-walk'])
  })

  it('filters empty and non-empty memos', () => {
    const rows = [
      {
        log: { ...baseLog, id: 'log-empty', memo: null },
        outfitName: 'Empty outfit',
        placeName: 'Cafe',
        transportName: 'Car',
      },
      {
        log: { ...baseLog, id: 'log-filled', memo: 'note' },
        outfitName: 'Filled outfit',
        placeName: 'Park',
        transportName: 'Walk',
      },
      {
        log: { ...baseLog, id: 'log-whitespace', memo: '   ' },
        outfitName: 'Whitespace outfit',
        placeName: 'Home',
        transportName: 'Car',
      },
    ]

    expect(
      filterAndSortWearLogRows(rows, {
        ...DEFAULT_WEAR_LOG_EDITOR_FILTERS,
        memoFilter: 'empty',
      }).map((row) => row.log.id),
    ).toEqual(['log-empty', 'log-whitespace'])
    expect(
      filterAndSortWearLogRows(rows, {
        ...DEFAULT_WEAR_LOG_EDITOR_FILTERS,
        memoFilter: 'notEmpty',
      }).map((row) => row.log.id),
    ).toEqual(['log-filled'])
  })

  it('removes a pending field when the edited value returns to the source value', () => {
    const withChange = mergeWearLogPatch(baseLog, {}, 'transportModeId', null)
    expect(withChange).toEqual({ transportModeId: null })
    expect(mergeWearLogPatch(baseLog, withChange, 'transportModeId', 'transport-walk')).toEqual({})
  })

  it('marks cleared back temperature as inferred when departure temperature exists', () => {
    expect(mergeWearLogPatch(baseLog, {}, 'tempBack', null)).toEqual({
      tempBack: null,
      tempBackInferred: true,
    })
  })

  it('defaults cooling intensity to normal and clears it again for off', () => {
    const cooling = mergeWearLogPatch(
      baseLog,
      {},
      'observedHvacMode',
      'cooling',
    )
    expect(cooling).toEqual({
      observedHvacMode: 'cooling',
      observedHvacIntensity: 'normal',
    })
    expect(
      mergeWearLogPatch(baseLog, cooling, 'observedHvacMode', 'off'),
    ).toEqual({})
  })
})
