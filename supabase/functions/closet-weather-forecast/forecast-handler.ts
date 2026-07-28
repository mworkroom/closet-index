import {
  KmaForecastError,
  parseKmaVilageForecastResponse,
  selectLatestKmaBaseTime,
  summarizeKmaForecast,
  type NormalizedWeatherForecast,
} from '../_shared/kma-forecast.ts'

const KMA_ENDPOINT =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
const REQUEST_LIMIT_BYTES = 4 * 1024
const RESPONSE_LIMIT_BYTES = 1024 * 1024
const KMA_PAGE_SIZE = 1000
const MAX_KMA_ITEMS = 5000
const MAX_FORECAST_DAYS_AHEAD = 4
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const HOUR_PATTERN = /^(?:[01]\d|2[0-3]):00$/

type ServiceKeyFormat = 'decoded' | 'encoded'

export type WeatherFunctionErrorCode =
  | 'invalid-request'
  | 'workspace-forbidden'
  | 'location-not-found'
  | 'weather-upstream-timeout'
  | 'weather-upstream-error'
  | 'weather-invalid-response'
  | 'weather-no-data'
  | 'weather-time-unavailable'
  | 'server-misconfigured'
  | 'internal-error'

export interface ForecastLocation {
  id: string
  label: string
  nx: number
  ny: number
}

export interface WeatherForecastRequest {
  workspaceId: string
  locationId: string
  forecastDate: string
  departureTime: string
  returnTime: string
}

export interface WeatherForecastResponse extends NormalizedWeatherForecast {
  location: {
    id: string
    label: string
  }
}

export interface WeatherForecastDependencies {
  serviceKey: string | undefined
  serviceKeyFormat?: string | undefined
  now?: () => Date
  fetchImpl?: typeof fetch
  timeoutMs?: number
  hasWorkspaceAccess: (
    userId: string,
    workspaceId: string,
  ) => Promise<boolean>
  getLocation: (
    workspaceId: string,
    locationId: string,
  ) => Promise<ForecastLocation | null>
}

class WeatherFunctionError extends Error {
  readonly code: WeatherFunctionErrorCode
  readonly status: number

  constructor(
    code: WeatherFunctionErrorCode,
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'WeatherFunctionError'
    this.code = code
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function kstDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function daysBetween(from: string, to: string): number {
  const fromTimestamp = Date.parse(`${from}T12:00:00+09:00`)
  const toTimestamp = Date.parse(`${to}T12:00:00+09:00`)
  return Math.round((toTimestamp - fromTimestamp) / (24 * 60 * 60 * 1000))
}

function parseRequestBody(value: unknown, now: Date): WeatherForecastRequest {
  if (!isRecord(value)) {
    throw new WeatherFunctionError(
      'invalid-request',
      '요청 본문은 JSON 객체여야 합니다.',
      400,
    )
  }

  const expectedKeys = [
    'departureTime',
    'forecastDate',
    'locationId',
    'returnTime',
    'workspaceId',
  ]
  const receivedKeys = Object.keys(value).sort()
  if (
    receivedKeys.length !== expectedKeys.length ||
    receivedKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new WeatherFunctionError(
      'invalid-request',
      '날씨 요청 필드가 올바르지 않습니다.',
      400,
    )
  }

  const request = value as unknown as WeatherForecastRequest
  if (
    typeof request.workspaceId !== 'string' ||
    typeof request.locationId !== 'string' ||
    !UUID_PATTERN.test(request.workspaceId) ||
    !UUID_PATTERN.test(request.locationId) ||
    typeof request.forecastDate !== 'string' ||
    !isValidCalendarDate(request.forecastDate) ||
    typeof request.departureTime !== 'string' ||
    !HOUR_PATTERN.test(request.departureTime) ||
    typeof request.returnTime !== 'string' ||
    !HOUR_PATTERN.test(request.returnTime)
  ) {
    throw new WeatherFunctionError(
      'invalid-request',
      'workspace, 위치, 날짜 또는 시간 형식이 올바르지 않습니다.',
      400,
    )
  }

  const forecastOffset = daysBetween(kstDate(now), request.forecastDate)
  if (forecastOffset < 0 || forecastOffset > MAX_FORECAST_DAYS_AHEAD) {
    throw new WeatherFunctionError(
      'invalid-request',
      '예보 날짜는 오늘부터 4일 이내여야 합니다.',
      400,
    )
  }

  return request
}

function serviceKeyFormat(
  serviceKey: string,
  configured: string | undefined,
): ServiceKeyFormat {
  if (configured === 'decoded' || configured === 'encoded') return configured
  return /%[0-9a-f]{2}/i.test(serviceKey) ? 'encoded' : 'decoded'
}

function buildKmaUrl(options: {
  serviceKey: string
  format: ServiceKeyFormat
  baseDate: string
  baseTime: string
  nx: number
  ny: number
  pageNo: number
}): string {
  const params = new URLSearchParams({
    numOfRows: String(KMA_PAGE_SIZE),
    pageNo: String(options.pageNo),
    dataType: 'JSON',
    base_date: options.baseDate,
    base_time: options.baseTime,
    nx: String(options.nx),
    ny: String(options.ny),
  })

  if (options.format === 'encoded') {
    return `${KMA_ENDPOINT}?serviceKey=${options.serviceKey}&${params.toString()}`
  }

  params.set('serviceKey', options.serviceKey)
  return `${KMA_ENDPOINT}?${params.toString()}`
}

async function fetchKmaPage(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new WeatherFunctionError(
        'weather-upstream-error',
        '기상청 예보 요청에 실패했습니다.',
        502,
      )
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (
      Number.isFinite(contentLength) &&
      contentLength > RESPONSE_LIMIT_BYTES
    ) {
      throw new WeatherFunctionError(
        'weather-invalid-response',
        '기상청 응답 크기가 허용 범위를 초과했습니다.',
        502,
      )
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > RESPONSE_LIMIT_BYTES) {
      throw new WeatherFunctionError(
        'weather-invalid-response',
        '기상청 응답 크기가 허용 범위를 초과했습니다.',
        502,
      )
    }

    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown
    } catch {
      throw new WeatherFunctionError(
        'weather-invalid-response',
        '기상청이 JSON이 아닌 응답을 반환했습니다.',
        502,
      )
    }
  } catch (error) {
    if (error instanceof WeatherFunctionError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new WeatherFunctionError(
        'weather-upstream-timeout',
        '기상청 응답 시간이 초과되었습니다.',
        504,
      )
    }
    throw new WeatherFunctionError(
      'weather-upstream-error',
      '기상청 예보 요청에 실패했습니다.',
      502,
    )
  } finally {
    clearTimeout(timeout)
  }
}

function responseItems(payload: unknown): {
  body: Record<string, unknown>
  itemsContainer: Record<string, unknown>
  items: unknown[]
  totalCount: number
} | null {
  if (!isRecord(payload)) return null
  const response = payload.response
  if (!isRecord(response)) return null
  const body = response.body
  if (!isRecord(body)) return null
  const itemsContainer = body.items
  if (!isRecord(itemsContainer)) return null

  const rawItems = itemsContainer.item
  const items = Array.isArray(rawItems)
    ? rawItems
    : rawItems === undefined
      ? []
      : [rawItems]
  const totalCount = Number(body.totalCount)
  if (!Number.isInteger(totalCount) || totalCount < items.length) return null

  return { body, itemsContainer, items, totalCount }
}

async function fetchKmaPayload(options: {
  serviceKey: string
  format: ServiceKeyFormat
  baseDate: string
  baseTime: string
  nx: number
  ny: number
  fetchImpl: typeof fetch
  timeoutMs: number
}): Promise<unknown> {
  const firstPayload = await fetchKmaPage(
    buildKmaUrl({ ...options, pageNo: 1 }),
    options.fetchImpl,
    options.timeoutMs,
  )
  const first = responseItems(firstPayload)
  if (!first || first.totalCount <= first.items.length) return firstPayload
  if (first.totalCount > MAX_KMA_ITEMS) {
    throw new WeatherFunctionError(
      'weather-invalid-response',
      '기상청 응답 건수가 허용 범위를 초과했습니다.',
      502,
    )
  }

  const pageCount = Math.ceil(first.totalCount / KMA_PAGE_SIZE)
  const allItems = [...first.items]
  for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
    const pagePayload = await fetchKmaPage(
      buildKmaUrl({ ...options, pageNo }),
      options.fetchImpl,
      options.timeoutMs,
    )
    const page = responseItems(pagePayload)
    if (!page) {
      throw new WeatherFunctionError(
        'weather-invalid-response',
        '기상청 페이지 응답 형식이 올바르지 않습니다.',
        502,
      )
    }
    allItems.push(...page.items)
  }

  first.itemsContainer.item = allItems
  first.body.numOfRows = allItems.length
  first.body.pageNo = 1
  return firstPayload
}

function mapKmaError(error: KmaForecastError): WeatherFunctionError {
  switch (error.code) {
    case 'invalid-request':
      return new WeatherFunctionError('invalid-request', error.message, 400)
    case 'api-error':
      return new WeatherFunctionError(
        'weather-upstream-error',
        '기상청 API가 오류를 반환했습니다.',
        502,
      )
    case 'no-data':
      return new WeatherFunctionError(
        'weather-no-data',
        '사용 가능한 기상청 예보가 없습니다.',
        404,
      )
    case 'missing-forecast-time':
      return new WeatherFunctionError(
        'weather-time-unavailable',
        '선택한 시간의 기상청 예보가 없습니다.',
        422,
      )
    case 'invalid-response':
      return new WeatherFunctionError(
        'weather-invalid-response',
        '기상청 응답 형식이 올바르지 않습니다.',
        502,
      )
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

function errorResponse(error: WeatherFunctionError): Response {
  return jsonResponse(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    error.status,
  )
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new WeatherFunctionError(
      'invalid-request',
      'Content-Type은 application/json이어야 합니다.',
      400,
    )
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(contentLength) &&
    contentLength > REQUEST_LIMIT_BYTES
  ) {
    throw new WeatherFunctionError(
      'invalid-request',
      '요청 본문이 너무 큽니다.',
      413,
    )
  }

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > REQUEST_LIMIT_BYTES) {
    throw new WeatherFunctionError(
      'invalid-request',
      '요청 본문이 너무 큽니다.',
      413,
    )
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new WeatherFunctionError(
      'invalid-request',
      '요청 본문이 올바른 JSON이 아닙니다.',
      400,
    )
  }
}

export async function handleWeatherForecastRequest(
  request: Request,
  userId: string,
  dependencies: WeatherForecastDependencies,
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return jsonResponse(
        {
          error: {
            code: 'invalid-request',
            message: 'POST 요청만 사용할 수 있습니다.',
          },
        },
        405,
        { Allow: 'POST' },
      )
    }

    if (!UUID_PATTERN.test(userId)) {
      throw new WeatherFunctionError(
        'internal-error',
        '인증 사용자 정보를 확인할 수 없습니다.',
        500,
      )
    }

    const now = dependencies.now?.() ?? new Date()
    const input = parseRequestBody(await readJsonBody(request), now)
    const hasAccess = await dependencies.hasWorkspaceAccess(
      userId,
      input.workspaceId,
    )
    if (!hasAccess) {
      throw new WeatherFunctionError(
        'workspace-forbidden',
        '이 workspace의 날씨를 조회할 권한이 없습니다.',
        403,
      )
    }

    const location = await dependencies.getLocation(
      input.workspaceId,
      input.locationId,
    )
    if (!location) {
      throw new WeatherFunctionError(
        'location-not-found',
        '선택한 날씨 위치를 찾을 수 없습니다.',
        404,
      )
    }

    const serviceKey = dependencies.serviceKey?.trim()
    if (!serviceKey) {
      throw new WeatherFunctionError(
        'server-misconfigured',
        '날씨 서버 설정이 완료되지 않았습니다.',
        500,
      )
    }

    const base = selectLatestKmaBaseTime(now)
    const payload = await fetchKmaPayload({
      serviceKey,
      format: serviceKeyFormat(serviceKey, dependencies.serviceKeyFormat),
      baseDate: base.baseDate,
      baseTime: base.baseTime,
      nx: location.nx,
      ny: location.ny,
      fetchImpl: dependencies.fetchImpl ?? fetch,
      timeoutMs: dependencies.timeoutMs ?? 8_000,
    })

    let forecast: NormalizedWeatherForecast
    try {
      forecast = summarizeKmaForecast(
        parseKmaVilageForecastResponse(payload),
        {
          forecastDate: input.forecastDate,
          departureTime: input.departureTime,
          returnTime: input.returnTime,
          fetchedAt: now,
        },
      )
    } catch (error) {
      if (error instanceof KmaForecastError) throw mapKmaError(error)
      throw error
    }

    const response: WeatherForecastResponse = {
      ...forecast,
      location: {
        id: location.id,
        label: location.label,
      },
    }
    return jsonResponse(response)
  } catch (error) {
    if (error instanceof WeatherFunctionError) return errorResponse(error)
    return errorResponse(
      new WeatherFunctionError(
        'internal-error',
        '날씨 정보를 처리하지 못했습니다.',
        500,
      ),
    )
  }
}
