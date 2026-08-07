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
  longWalkCondition: 'unknown',
  placeId: 'place-1',
  transportModeId: 'transport-walk',
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
})

