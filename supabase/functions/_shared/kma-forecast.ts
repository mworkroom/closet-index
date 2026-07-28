const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const KMA_RELEASE_DELAY_MS = 10 * 60 * 1000
const KMA_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23] as const

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const COMPACT_DATE_PATTERN = /^\d{8}$/
const HOUR_TIME_PATTERN = /^(?:[01]\d|2[0-3]):00$/
const COMPACT_TIME_PATTERN = /^(?:[01]\d|2[0-3])[0-5]\d$/

export type KmaPrecipitationType =
  | 'none'
  | 'rain'
  | 'rain-snow'
  | 'snow'
  | 'shower'
  | 'unknown'

export type KmaSkyCondition = 'clear' | 'mostly-cloudy' | 'cloudy' | 'unknown'

export type KmaForecastErrorCode =
  | 'invalid-request'
  | 'invalid-response'
  | 'api-error'
  | 'no-data'
  | 'missing-forecast-time'

export class KmaForecastError extends Error {
  readonly code: KmaForecastErrorCode
  readonly details: Readonly<Record<string, unknown>>

  constructor(
    code: KmaForecastErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'KmaForecastError'
    this.code = code
    this.details = details
  }
}

export interface KmaBaseTime {
  baseDate: string
  baseTime: string
  issuedAt: string
  availableAt: string
}

export interface KmaForecastPoint {
  at: string
  forecastDate: string
  forecastTime: string
  categories: Readonly<Record<string, string>>
}

export interface KmaForecastDataset {
  source: 'kma-vilage-fcst'
  baseDate: string
  baseTime: string
  issuedAt: string
  nx: number
  ny: number
  points: KmaForecastPoint[]
}

export interface KmaAmount {
  value: number | null
  label: string | null
  hasAmount: boolean
}

export interface NormalizedWeatherPoint {
  at: string
  temperature: number | null
  humidity: number | null
  precipitationProbability: number | null
  precipitationType: KmaPrecipitationType
  precipitationAmount: KmaAmount
  snowAmount: KmaAmount
  sky: KmaSkyCondition
  windSpeed: number | null
  hasPrecipitation: boolean
  missingCategories: string[]
}

export interface NormalizedWeatherForecast {
  source: 'kma-vilage-fcst'
  issuedAt: string
  fetchedAt: string
  nx: number
  ny: number
  departure: NormalizedWeatherPoint
  return: NormalizedWeatherPoint
  period: {
    hasPrecipitation: boolean
    precipitationTypes: KmaPrecipitationType[]
    maxPrecipitationProbability: number | null
    minHumidity: number | null
    maxHumidity: number | null
  }
  stale: false
  warnings: string[]
}

interface TripSelection {
  forecastDate: string
  departureTime: string
  returnTime: string
  fetchedAt?: Date
}

interface ParsedItem {
  baseDate: string
  baseTime: string
  forecastDate: string
  forecastTime: string
  category: string
  value: string
  nx: number
  ny: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new KmaForecastError(
      'invalid-response',
      `기상청 응답의 ${field} 형식이 올바르지 않습니다.`,
    )
  }
  return value
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function requiredString(value: unknown, field: string): string {
  const parsed = stringValue(value)
  if (parsed === null || parsed === '') {
    throw new KmaForecastError(
      'invalid-response',
      `기상청 응답의 ${field} 값이 없습니다.`,
    )
  }
  return parsed
}

function requiredPositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new KmaForecastError(
      'invalid-response',
      `기상청 응답의 ${field} 값이 올바르지 않습니다.`,
    )
  }
  return parsed
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function compactDate(date: string): string {
  return date.replaceAll('-', '')
}

function expandedDate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

function compactTime(time: string): string {
  return time.replace(':', '')
}

function isValidCalendarDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function expandedTime(time: string): string {
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`
}

function formatKstIso(timestamp: number): string {
  const shifted = new Date(timestamp + KST_OFFSET_MS)
  return [
    shifted.getUTCFullYear(),
    '-',
    pad2(shifted.getUTCMonth() + 1),
    '-',
    pad2(shifted.getUTCDate()),
    'T',
    pad2(shifted.getUTCHours()),
    ':',
    pad2(shifted.getUTCMinutes()),
    ':',
    pad2(shifted.getUTCSeconds()),
    '+09:00',
  ].join('')
}

function kstTimestamp(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00+09:00`)
}

function addDays(date: string, days: number): string {
  if (!isValidCalendarDate(date)) {
    throw new KmaForecastError(
      'invalid-request',
      '외출 날짜 형식이 올바르지 않습니다.',
    )
  }
  const timestamp = Date.parse(`${date}T12:00:00+09:00`)
  return formatKstIso(timestamp + days * 24 * 60 * 60 * 1000).slice(0, 10)
}

function forecastIso(date: string, time: string): string {
  return `${date}T${time}:00+09:00`
}

function pointKey(date: string, time: string): string {
  return `${date}T${time}`
}

export function selectLatestKmaBaseTime(now = new Date()): KmaBaseTime {
  const nowTimestamp = now.getTime()
  const shiftedNow = new Date(nowTimestamp + KST_OFFSET_MS)
  const today = [
    shiftedNow.getUTCFullYear(),
    '-',
    pad2(shiftedNow.getUTCMonth() + 1),
    '-',
    pad2(shiftedNow.getUTCDate()),
  ].join('')

  let latest: KmaBaseTime | null = null
  let latestIssuedTimestamp = Number.NEGATIVE_INFINITY

  for (const dayOffset of [-1, 0]) {
    const date = addDays(today, dayOffset)
    for (const hour of KMA_BASE_HOURS) {
      const time = `${pad2(hour)}:00`
      const issuedTimestamp = kstTimestamp(date, time)
      const availableTimestamp = issuedTimestamp + KMA_RELEASE_DELAY_MS

      if (
        availableTimestamp <= nowTimestamp &&
        issuedTimestamp > latestIssuedTimestamp
      ) {
        latestIssuedTimestamp = issuedTimestamp
        latest = {
          baseDate: compactDate(date),
          baseTime: compactTime(time),
          issuedAt: forecastIso(date, time),
          availableAt: formatKstIso(availableTimestamp),
        }
      }
    }
  }

  if (!latest) {
    throw new KmaForecastError(
      'invalid-request',
      '사용 가능한 단기예보 발표시각을 계산하지 못했습니다.',
    )
  }

  return latest
}

function parseItem(value: unknown): ParsedItem {
  const item = requiredRecord(value, 'item')
  const baseDate = requiredString(item.baseDate, 'baseDate')
  const baseTime = requiredString(item.baseTime, 'baseTime')
  const forecastDate = requiredString(item.fcstDate, 'fcstDate')
  const forecastTime = requiredString(item.fcstTime, 'fcstTime')
  const category = requiredString(item.category, 'category')
  const forecastValue = requiredString(item.fcstValue, 'fcstValue')

  if (
    !COMPACT_DATE_PATTERN.test(baseDate) ||
    !COMPACT_DATE_PATTERN.test(forecastDate) ||
    !isValidCalendarDate(expandedDate(baseDate)) ||
    !isValidCalendarDate(expandedDate(forecastDate)) ||
    !COMPACT_TIME_PATTERN.test(baseTime) ||
    !COMPACT_TIME_PATTERN.test(forecastTime)
  ) {
    throw new KmaForecastError(
      'invalid-response',
      '기상청 응답의 날짜 또는 시각 형식이 올바르지 않습니다.',
    )
  }

  return {
    baseDate,
    baseTime,
    forecastDate: expandedDate(forecastDate),
    forecastTime: expandedTime(forecastTime),
    category,
    value: forecastValue,
    nx: requiredPositiveInteger(item.nx, 'nx'),
    ny: requiredPositiveInteger(item.ny, 'ny'),
  }
}

export function parseKmaVilageForecastResponse(
  payload: unknown,
): KmaForecastDataset {
  const root = requiredRecord(payload, 'root')
  const response = requiredRecord(root.response, 'response')
  const header = requiredRecord(response.header, 'header')
  const resultCode = requiredString(header.resultCode, 'resultCode')

  if (resultCode !== '00' && resultCode !== '0') {
    throw new KmaForecastError(
      'api-error',
      '기상청 API가 오류 코드를 반환했습니다.',
      { resultCode },
    )
  }

  const body = requiredRecord(response.body, 'body')
  const itemsContainer = body.items

  if (!isRecord(itemsContainer) || itemsContainer.item === undefined) {
    throw new KmaForecastError(
      'no-data',
      '기상청 단기예보 응답에 예보 항목이 없습니다.',
    )
  }

  const rawItems = Array.isArray(itemsContainer.item)
    ? itemsContainer.item
    : [itemsContainer.item]

  if (rawItems.length === 0) {
    throw new KmaForecastError(
      'no-data',
      '기상청 단기예보 응답에 예보 항목이 없습니다.',
    )
  }

  const items = rawItems.map(parseItem)
  const first = items[0]

  for (const item of items) {
    if (
      item.baseDate !== first.baseDate ||
      item.baseTime !== first.baseTime ||
      item.nx !== first.nx ||
      item.ny !== first.ny
    ) {
      throw new KmaForecastError(
        'invalid-response',
        '서로 다른 발표본 또는 격자의 예보 항목이 섞여 있습니다.',
      )
    }
  }

  const grouped = new Map<string, KmaForecastPoint>()
  for (const item of items) {
    const key = pointKey(item.forecastDate, item.forecastTime)
    const existing = grouped.get(key)
    const categories = {
      ...(existing?.categories ?? {}),
      [item.category]: item.value,
    }
    grouped.set(key, {
      at: forecastIso(item.forecastDate, item.forecastTime),
      forecastDate: item.forecastDate,
      forecastTime: item.forecastTime,
      categories,
    })
  }

  return {
    source: 'kma-vilage-fcst',
    baseDate: first.baseDate,
    baseTime: first.baseTime,
    issuedAt: forecastIso(
      expandedDate(first.baseDate),
      expandedTime(first.baseTime),
    ),
    nx: first.nx,
    ny: first.ny,
    points: [...grouped.values()].sort((a, b) => a.at.localeCompare(b.at)),
  }
}

function optionalNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed >= 900 || parsed <= -900) return null
  return parsed
}

function percentage(value: string | undefined): number | null {
  const parsed = optionalNumber(value)
  if (parsed === null || parsed < 0 || parsed > 100) return null
  return parsed
}

function precipitationType(value: string | undefined): KmaPrecipitationType {
  switch (value?.trim()) {
    case '0':
      return 'none'
    case '1':
      return 'rain'
    case '2':
      return 'rain-snow'
    case '3':
      return 'snow'
    case '4':
      return 'shower'
    default:
      return 'unknown'
  }
}

function skyCondition(value: string | undefined): KmaSkyCondition {
  switch (value?.trim()) {
    case '1':
      return 'clear'
    case '3':
      return 'mostly-cloudy'
    case '4':
      return 'cloudy'
    default:
      return 'unknown'
  }
}

function amount(value: string | undefined, unit: 'mm' | 'cm'): KmaAmount {
  if (value === undefined) {
    return { value: null, label: null, hasAmount: false }
  }

  const label = value.trim()
  const compact = label.replaceAll(' ', '').toLowerCase()
  if (
    compact === '' ||
    compact === '-' ||
    compact === 'null' ||
    compact === '0' ||
    compact === '0.0' ||
    compact === '강수없음' ||
    compact === '적설없음'
  ) {
    return { value: null, label: null, hasAmount: false }
  }

  const numeric = compact.match(new RegExp(`^(\\d+(?:\\.\\d+)?)(?:${unit})?$`))
  if (numeric) {
    const parsed = Number(numeric[1])
    if (parsed === 0) {
      return { value: null, label: null, hasAmount: false }
    }
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        value: parsed,
        label: `${numeric[1]}${unit}`,
        hasAmount: true,
      }
    }
  }

  const sentinel = Number(compact)
  if (Number.isFinite(sentinel) && (sentinel >= 900 || sentinel <= -900)) {
    return { value: null, label: null, hasAmount: false }
  }

  return { value: null, label, hasAmount: true }
}

function normalizePoint(point: KmaForecastPoint): NormalizedWeatherPoint {
  const categories = point.categories
  const pcp = amount(categories.PCP, 'mm')
  const sno = amount(categories.SNO, 'cm')
  const type = precipitationType(categories.PTY)
  const precipitation =
    type === 'rain' ||
    type === 'rain-snow' ||
    type === 'snow' ||
    type === 'shower' ||
    pcp.hasAmount ||
    sno.hasAmount

  const expectedCategories = ['TMP', 'REH', 'POP', 'PTY', 'PCP', 'SNO', 'SKY', 'WSD']

  return {
    at: point.at,
    temperature: optionalNumber(categories.TMP),
    humidity: percentage(categories.REH),
    precipitationProbability: percentage(categories.POP),
    precipitationType: type,
    precipitationAmount: pcp,
    snowAmount: sno,
    sky: skyCondition(categories.SKY),
    windSpeed: optionalNumber(categories.WSD),
    hasPrecipitation: precipitation,
    missingCategories: expectedCategories.filter(
      (category) => categories[category] === undefined,
    ),
  }
}

export function availableForecastTimes(
  dataset: KmaForecastDataset,
  forecastDate: string,
): string[] {
  if (!isValidCalendarDate(forecastDate)) {
    throw new KmaForecastError(
      'invalid-request',
      '외출 날짜 형식이 올바르지 않습니다.',
    )
  }

  return dataset.points
    .filter((point) => point.forecastDate === forecastDate)
    .map((point) => point.forecastTime)
    .sort()
}

function validateSelection(selection: TripSelection): void {
  if (
    !isValidCalendarDate(selection.forecastDate) ||
    !HOUR_TIME_PATTERN.test(selection.departureTime) ||
    !HOUR_TIME_PATTERN.test(selection.returnTime) ||
    (selection.fetchedAt !== undefined &&
      !Number.isFinite(selection.fetchedAt.getTime()))
  ) {
    throw new KmaForecastError(
      'invalid-request',
      '외출 날짜 또는 시각 형식이 올바르지 않습니다.',
    )
  }
}

function requiredPoint(
  pointsByKey: ReadonlyMap<string, KmaForecastPoint>,
  date: string,
  time: string,
): KmaForecastPoint {
  const point = pointsByKey.get(pointKey(date, time))
  if (!point) {
    throw new KmaForecastError(
      'missing-forecast-time',
      '선택한 시각의 단기예보가 없습니다.',
      { forecastDate: date, forecastTime: time },
    )
  }
  return point
}

function minOrNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null)
  return present.length === 0 ? null : Math.min(...present)
}

function maxOrNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null)
  return present.length === 0 ? null : Math.max(...present)
}

export function summarizeKmaForecast(
  dataset: KmaForecastDataset,
  selection: TripSelection,
): NormalizedWeatherForecast {
  validateSelection(selection)

  const returnDate =
    selection.returnTime < selection.departureTime
      ? addDays(selection.forecastDate, 1)
      : selection.forecastDate

  const departureTimestamp = kstTimestamp(
    selection.forecastDate,
    selection.departureTime,
  )
  const returnTimestamp = kstTimestamp(returnDate, selection.returnTime)
  const pointsByKey = new Map(
    dataset.points.map((point) => [
      pointKey(point.forecastDate, point.forecastTime),
      point,
    ]),
  )

  const departure = normalizePoint(
    requiredPoint(
      pointsByKey,
      selection.forecastDate,
      selection.departureTime,
    ),
  )
  const returnPoint = normalizePoint(
    requiredPoint(pointsByKey, returnDate, selection.returnTime),
  )
  const periodPoints = dataset.points
    .filter((point) => {
      const timestamp = Date.parse(point.at)
      return timestamp >= departureTimestamp && timestamp <= returnTimestamp
    })
    .map(normalizePoint)

  const precipitationTypes = [
    ...new Set(
      periodPoints
        .map((point) => point.precipitationType)
        .filter(
          (type): type is Exclude<KmaPrecipitationType, 'none' | 'unknown'> =>
            type !== 'none' && type !== 'unknown',
        ),
    ),
  ]

  const warnings = [
    ...departure.missingCategories.map((category) => `departure:${category}`),
    ...returnPoint.missingCategories.map((category) => `return:${category}`),
  ]

  return {
    source: dataset.source,
    issuedAt: dataset.issuedAt,
    fetchedAt: formatKstIso((selection.fetchedAt ?? new Date()).getTime()),
    nx: dataset.nx,
    ny: dataset.ny,
    departure,
    return: returnPoint,
    period: {
      hasPrecipitation: periodPoints.some((point) => point.hasPrecipitation),
      precipitationTypes,
      maxPrecipitationProbability: maxOrNull(
        periodPoints.map((point) => point.precipitationProbability),
      ),
      minHumidity: minOrNull(periodPoints.map((point) => point.humidity)),
      maxHumidity: maxOrNull(periodPoints.map((point) => point.humidity)),
    },
    stale: false,
    warnings,
  }
}
