import { describe, expect, it, vi } from 'vitest'
import type { WearLogInput } from '../lib/types'
import { collectAllPages } from './supabase-repository'
import { toWearLogMutableRow, toWearLogPatchRow } from './supabase/shared'

const wearLogInput: WearLogInput = {
  outfitId: 'outfit-1',
  wornOn: '2026-08-07',
  tempOut: 30,
  tempBack: 28,
  tempBackInferred: false,
  feelingOut: 'ok',
  feelingBack: 'ok',
  rainCondition: 'no',
  longWalkCondition: 'yes',
  placeId: 'place-1',
  transportModeId: 'transport-walk-short',
  observedHvacMode: 'off',
  observedHvacIntensity: null,
  observedHvacMemo: null,
  memo: null,
  temperatureSource: 'manual',
  weatherLocationId: null,
  weatherIssuedAt: null,
  weatherOverridden: false,
  submissionToken: 'submission-1',
}

describe('collectAllPages', () => {
  it('1,000행 제한을 넘는 관계를 마지막 페이지까지 모두 합친다', async () => {
    const source = Array.from({ length: 2401 }, (_, index) => index)
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }))

    const result = await collectAllPages(fetchPage)

    expect(result.error).toBeNull()
    expect(result.data).toEqual(source)
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('중간 페이지가 실패하면 불완전한 관계를 사용하지 않는다', async () => {
    const error = new Error('page failed')
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, index) => index),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error })

    await expect(collectAllPages<number>(fetchPage)).resolves.toEqual({
      data: null,
      error,
    })
  })
})

describe('Wear Log Transport repository payloads', () => {
  it('preserves the selected Transport ID in create and full update payloads', () => {
    expect(toWearLogMutableRow(wearLogInput)).toMatchObject({
      transport_mode_id: 'transport-walk-short',
      long_walk_condition: 'yes',
    })
    expect(
      toWearLogMutableRow({
        ...wearLogInput,
        transportModeId: 'transport-walk-sustained',
      }),
    ).toMatchObject({
      transport_mode_id: 'transport-walk-sustained',
      long_walk_condition: 'yes',
    })
  })

  it('preserves only the selected Transport ID in partial editor updates', () => {
    expect(
      toWearLogPatchRow({ transportModeId: 'transport-walk-short' }),
    ).toEqual({ transport_mode_id: 'transport-walk-short' })
    expect(
      toWearLogPatchRow({ transportModeId: 'transport-walk-sustained' }),
    ).toEqual({ transport_mode_id: 'transport-walk-sustained' })
  })
})

describe('Wear Log HVAC repository payloads', () => {
  it('maps actual HVAC fields for full and partial saves', () => {
    expect(
      toWearLogMutableRow({
        ...wearLogInput,
        observedHvacMode: 'cooling',
        observedHvacIntensity: 'normal',
        observedHvacMemo: 'comfortable',
      }),
    ).toMatchObject({
      observed_hvac_mode: 'cooling',
      observed_hvac_intensity: 'normal',
      observed_hvac_memo: 'comfortable',
    })
    expect(
      toWearLogPatchRow({
        observedHvacMode: 'off',
        observedHvacIntensity: null,
      }),
    ).toEqual({
      observed_hvac_mode: 'off',
      observed_hvac_intensity: null,
    })
  })
})
