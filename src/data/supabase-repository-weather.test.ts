import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseRepository } from './supabase-repository'

describe('SupabaseRepository default weather location updates', () => {
  it('updates a saved location only inside the active workspace', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['update', 'eq', 'select']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'location',
        label: '창4동',
        official_name: '서울특별시 도봉구 창제4동',
        admin_code: '1132051400',
        nx: 61,
        ny: 129,
        is_default: true,
      },
      error: null,
    }))
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    const saved = await repository.saveDefaultWeatherLocation({
      id: 'location',
      label: ' 창4동 ',
      officialName: ' 서울특별시 도봉구 창제4동 ',
      adminCode: ' 1132051400 ',
      nx: 61,
      ny: 129,
    })

    expect(client.from).toHaveBeenCalledWith('closet_weather_locations')
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        label: '창4동',
        official_name: '서울특별시 도봉구 창제4동',
        admin_code: '1132051400',
        nx: 61,
        ny: 129,
        is_default: true,
      }),
    )
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'id', 'location')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'workspace_id', 'workspace')
    expect(saved).toEqual({
      id: 'location',
      label: '창4동',
      officialName: '서울특별시 도봉구 창제4동',
      adminCode: '1132051400',
      nx: 61,
      ny: 129,
      isDefault: true,
    })
  })
})

describe('SupabaseRepository weather forecast function', () => {
  it('invokes the authenticated function with the active workspace', async () => {
    const response = {
      source: 'kma-vilage-fcst',
      issuedAt: '2026-07-29T05:00:00+09:00',
      fetchedAt: '2026-07-29T08:00:00+09:00',
      nx: 61,
      ny: 129,
      location: { id: 'location', label: '창4동' },
      departure: { temperature: 24 },
      return: { temperature: 20 },
      period: { hasPrecipitation: false },
      stale: false,
      warnings: [],
    }
    const invoke = vi.fn(async () => ({ data: response, error: null }))
    const client = {
      functions: { invoke },
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    const result = await repository.fetchWeatherForecast({
      locationId: 'location',
      forecastDate: '2026-07-29',
      departureTime: '09:00',
      returnTime: '18:00',
    })

    expect(invoke).toHaveBeenCalledWith('closet-weather-forecast', {
      body: {
        workspaceId: 'workspace',
        locationId: 'location',
        forecastDate: '2026-07-29',
        departureTime: '09:00',
        returnTime: '18:00',
      },
    })
    expect(result).toBe(response)
  })
})

describe('SupabaseRepository weather Wear Log writes', () => {
  it('writes and returns the minimum weather provenance fields', async () => {
    const row = {
      id: 'log',
      outfit_id: 'outfit',
      worn_on: '2026-07-29',
      temp_out: 24,
      temp_back: 20,
      temp_back_inferred: false,
      feeling_out: 'ok',
      feeling_back: 'ok',
      rain_condition: 'no',
      long_walk_condition: 'no',
      place_id: null,
      transport_mode_id: null,
      memo: null,
      temperature_source: 'weather',
      weather_location_id: 'location',
      weather_issued_at: '2026-07-29T05:00:00+09:00',
      weather_overridden: true,
      submission_token: 'token',
      created_at: '2026-07-29T12:00:00+09:00',
    }
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['insert', 'select']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.single = vi.fn(async () => ({ data: row, error: null }))
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    const created = await repository.createWearLog({
      outfitId: 'outfit',
      wornOn: '2026-07-29',
      tempOut: 24,
      tempBack: 20,
      tempBackInferred: false,
      feelingOut: 'ok',
      feelingBack: 'ok',
      rainCondition: 'no',
      longWalkCondition: 'no',
      placeId: null,
      transportModeId: null,
      observedHvacMode: 'off',
      observedHvacIntensity: null,
      observedHvacMemo: null,
      memo: null,
      temperatureSource: 'weather',
      weatherLocationId: 'location',
      weatherIssuedAt: '2026-07-29T05:00:00+09:00',
      weatherOverridden: true,
      submissionToken: 'token',
    })

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'workspace',
        temperature_source: 'weather',
        weather_location_id: 'location',
        weather_issued_at: '2026-07-29T05:00:00+09:00',
        weather_overridden: true,
      }),
    )
    expect(created).toMatchObject({
      temperatureSource: 'weather',
      weatherLocationId: 'location',
      weatherIssuedAt: '2026-07-29T05:00:00+09:00',
      weatherOverridden: true,
    })
  })
})
