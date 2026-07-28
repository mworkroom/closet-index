import { describe, expect, it, vi } from 'vitest'
import {
  handleWeatherForecastRequest,
  type WeatherForecastDependencies,
} from '../../supabase/functions/closet-weather-forecast/forecast-handler'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000003'
const LOCATION_ID = '00000000-0000-4000-8000-000000000004'
const NOW = new Date('2026-07-28T12:00:00.000Z')

function kmaItem(
  time: string,
  category: string,
  value: string | number,
) {
  return {
    baseDate: '20260728',
    baseTime: '2000',
    fcstDate: '20260728',
    fcstTime: time,
    category,
    fcstValue: value,
    nx: 61,
    ny: 129,
  }
}

function kmaPoint(time: string, temperature: number) {
  return [
    kmaItem(time, 'TMP', temperature),
    kmaItem(time, 'REH', 70),
    kmaItem(time, 'POP', 20),
    kmaItem(time, 'PTY', 0),
    kmaItem(time, 'PCP', '강수없음'),
    kmaItem(time, 'SNO', '적설없음'),
    kmaItem(time, 'SKY', 1),
    kmaItem(time, 'WSD', 1.2),
  ]
}

function kmaPayload(
  items = [...kmaPoint('2100', 29), ...kmaPoint('2200', 28)],
  resultCode = '00',
) {
  return {
    response: {
      header: { resultCode, resultMsg: 'NORMAL_SERVICE' },
      body: {
        dataType: 'JSON',
        items: { item: items },
        pageNo: 1,
        numOfRows: 1000,
        totalCount: items.length,
      },
    },
  }
}

function request(
  overrides: Partial<Record<string, unknown>> = {},
  method = 'POST',
) {
  return new Request(
    'https://example.supabase.co/functions/v1/closet-weather-forecast',
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:
        method === 'POST'
          ? JSON.stringify({
              workspaceId: WORKSPACE_ID,
              locationId: LOCATION_ID,
              forecastDate: '2026-07-28',
              departureTime: '21:00',
              returnTime: '22:00',
              ...overrides,
            })
          : undefined,
    },
  )
}

function dependencies(
  overrides: Partial<WeatherForecastDependencies> = {},
): WeatherForecastDependencies {
  return {
    serviceKey: 'test-key+/=',
    now: () => NOW,
    fetchImpl: vi.fn(async () =>
      Response.json(kmaPayload()),
    ) as unknown as typeof fetch,
    hasWorkspaceAccess: vi.fn(async () => true),
    getLocation: vi.fn(async () => ({
      id: LOCATION_ID,
      label: '창4동',
      nx: 61,
      ny: 129,
    })),
    ...overrides,
  }
}

async function json(response: Response) {
  return (await response.json()) as Record<string, any>
}

describe('closet-weather-forecast handler', () => {
  it('returns only the normalized forecast and location for a workspace member', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('serviceKey=test-key%2B%2F%3D')
      return Response.json(kmaPayload())
    }) as unknown as typeof fetch
    const response = await handleWeatherForecastRequest(
      request(),
      USER_ID,
      dependencies({ fetchImpl }),
    )
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      source: 'kma-vilage-fcst',
      nx: 61,
      ny: 129,
      departure: { temperature: 29 },
      return: { temperature: 28 },
      location: { id: LOCATION_ID, label: '창4동' },
    })
    expect(body).not.toHaveProperty('categories')
    expect(JSON.stringify(body)).not.toContain('test-key')
  })

  it('rejects unknown request fields before database or KMA access', async () => {
    const deps = dependencies()
    const response = await handleWeatherForecastRequest(
      request({ unexpected: true }),
      USER_ID,
      deps,
    )
    const body = await json(response)

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('invalid-request')
    expect(deps.hasWorkspaceAccess).not.toHaveBeenCalled()
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects forecast dates outside the short-term range', async () => {
    const response = await handleWeatherForecastRequest(
      request({ forecastDate: '2026-08-02' }),
      USER_ID,
      dependencies(),
    )
    const body = await json(response)

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('invalid-request')
  })

  it('rejects a user who is not a workspace member', async () => {
    const deps = dependencies({
      hasWorkspaceAccess: vi.fn(async () => false),
    })
    const response = await handleWeatherForecastRequest(
      request(),
      USER_ID,
      deps,
    )
    const body = await json(response)

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('workspace-forbidden')
    expect(deps.getLocation).not.toHaveBeenCalled()
  })

  it('does not reveal whether another workspace location exists', async () => {
    const deps = dependencies({
      getLocation: vi.fn(async () => null),
    })
    const response = await handleWeatherForecastRequest(
      request(),
      USER_ID,
      deps,
    )
    const body = await json(response)

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('location-not-found')
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('reports missing server secrets without contacting KMA', async () => {
    const deps = dependencies({ serviceKey: ' ' })
    const response = await handleWeatherForecastRequest(
      request(),
      USER_ID,
      deps,
    )
    const body = await json(response)

    expect(response.status).toBe(500)
    expect(body.error.code).toBe('server-misconfigured')
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('maps KMA API errors to a stable application error code', async () => {
    const response = await handleWeatherForecastRequest(
      request(),
      USER_ID,
      dependencies({
        fetchImpl: vi.fn(async () =>
          Response.json(kmaPayload([], '03')),
        ) as unknown as typeof fetch,
      }),
    )
    const body = await json(response)

    expect(response.status).toBe(502)
    expect(body.error).toEqual({
      code: 'weather-upstream-error',
      message: '기상청 API가 오류를 반환했습니다.',
    })
  })

  it('maps an aborted upstream request to a timeout response', async () => {
    const response = await handleWeatherForecastRequest(
      request(),
      USER_ID,
      dependencies({
        fetchImpl: vi.fn(async () => {
          throw new DOMException('aborted', 'AbortError')
        }) as unknown as typeof fetch,
      }),
    )
    const body = await json(response)

    expect(response.status).toBe(504)
    expect(body.error.code).toBe('weather-upstream-timeout')
  })

  it('rejects methods other than POST', async () => {
    const response = await handleWeatherForecastRequest(
      request({}, 'GET'),
      USER_ID,
      dependencies(),
    )
    const body = await json(response)

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(body.error.code).toBe('invalid-request')
  })
})
