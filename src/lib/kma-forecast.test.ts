import { describe, expect, it } from 'vitest'
import {
  KmaForecastError,
  availableForecastTimes,
  parseKmaVilageForecastResponse,
  selectLatestKmaBaseTime,
  summarizeKmaForecast,
} from '../../supabase/functions/_shared/kma-forecast'

const BASE_DATE = '20260728'
const BASE_TIME = '0500'
const NX = 61
const NY = 129

interface FixtureValue {
  date: string
  time: string
  category: string
  value: string | number
}

function item({
  date,
  time,
  category,
  value,
}: FixtureValue): Record<string, string | number> {
  return {
    baseDate: BASE_DATE,
    baseTime: BASE_TIME,
    fcstDate: date.replaceAll('-', ''),
    fcstTime: time.replace(':', ''),
    category,
    fcstValue: value,
    nx: NX,
    ny: NY,
  }
}

function point(
  date: string,
  time: string,
  values: Partial<Record<string, string | number>> = {},
): FixtureValue[] {
  const merged: Record<string, string | number> = {
    TMP: 20,
    REH: 60,
    POP: 20,
    PTY: 0,
    PCP: '강수없음',
    SNO: '적설없음',
    SKY: 1,
    WSD: 2.1,
  }

  for (const [category, value] of Object.entries(values)) {
    if (value !== undefined) merged[category] = value
  }

  return Object.entries(merged).map(([category, value]) => ({
    date,
    time,
    category,
    value,
  }))
}

function response(
  values: FixtureValue[],
  resultCode = '00',
): Record<string, unknown> {
  return {
    response: {
      header: {
        resultCode,
        resultMsg: resultCode === '00' ? 'NORMAL_SERVICE' : 'ERROR',
      },
      body: {
        dataType: 'JSON',
        items: {
          item: values.map(item),
        },
        numOfRows: values.length,
        pageNo: 1,
        totalCount: values.length,
      },
    },
  }
}

function errorCode(action: () => unknown): string | null {
  try {
    action()
    return null
  } catch (error) {
    expect(error).toBeInstanceOf(KmaForecastError)
    return (error as KmaForecastError).code
  }
}

describe('selectLatestKmaBaseTime', () => {
  it('발표 10분 전에는 직전 발표본을 사용한다', () => {
    expect(
      selectLatestKmaBaseTime(new Date('2026-07-28T05:09:59+09:00')),
    ).toMatchObject({
      baseDate: '20260728',
      baseTime: '0200',
      issuedAt: '2026-07-28T02:00:00+09:00',
    })
  })

  it('발표 10분부터 새 발표본을 사용한다', () => {
    expect(
      selectLatestKmaBaseTime(new Date('2026-07-28T05:10:00+09:00')),
    ).toMatchObject({
      baseDate: '20260728',
      baseTime: '0500',
      availableAt: '2026-07-28T05:10:00+09:00',
    })
  })

  it('자정 직후에는 전날 23시 발표본을 사용한다', () => {
    expect(
      selectLatestKmaBaseTime(new Date('2026-07-28T00:05:00+09:00')),
    ).toMatchObject({
      baseDate: '20260727',
      baseTime: '2300',
    })
  })
})

describe('parseKmaVilageForecastResponse', () => {
  it('category 배열을 날짜와 시각별 point로 묶는다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-28', '09:00', { TMP: 24 }),
        ...point('2026-07-28', '18:00', { TMP: 20 }),
      ]),
    )

    expect(dataset).toMatchObject({
      source: 'kma-vilage-fcst',
      issuedAt: '2026-07-28T05:00:00+09:00',
      nx: NX,
      ny: NY,
    })
    expect(dataset.points).toHaveLength(2)
    expect(dataset.points[0].categories.TMP).toBe('24')
  })

  it('API 오류와 데이터 없음과 malformed 응답을 구분한다', () => {
    expect(errorCode(() => parseKmaVilageForecastResponse(response([], '03')))).toBe(
      'api-error',
    )
    expect(errorCode(() => parseKmaVilageForecastResponse(response([])))).toBe(
      'no-data',
    )
    expect(
      errorCode(() =>
        parseKmaVilageForecastResponse({
          response: { header: { resultCode: '00' }, body: { items: { item: [{}] } } },
        }),
      ),
    ).toBe('invalid-response')
  })
})

describe('availableForecastTimes', () => {
  it('3시간 간격 발표 구간에서 실제 응답 시각만 반환한다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-31', '00:00'),
        ...point('2026-07-31', '03:00'),
        ...point('2026-07-31', '06:00'),
      ]),
    )

    expect(availableForecastTimes(dataset, '2026-07-31')).toEqual([
      '00:00',
      '03:00',
      '06:00',
    ])
  })
})

describe('summarizeKmaForecast', () => {
  it('출발·귀가 온도와 외출 구간의 습도·강수확률을 요약한다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-28', '09:00', { TMP: 24, REH: 62, POP: 10 }),
        ...point('2026-07-28', '12:00', { TMP: 26, REH: 70, POP: 30 }),
        ...point('2026-07-28', '18:00', { TMP: 20, REH: 78, POP: 20 }),
      ]),
    )
    const result = summarizeKmaForecast(dataset, {
      forecastDate: '2026-07-28',
      departureTime: '09:00',
      returnTime: '18:00',
      fetchedAt: new Date('2026-07-28T07:12:30+09:00'),
    })

    expect(result.departure.temperature).toBe(24)
    expect(result.return.temperature).toBe(20)
    expect(result.period).toEqual({
      hasPrecipitation: false,
      precipitationTypes: [],
      maxPrecipitationProbability: 30,
      minHumidity: 62,
      maxHumidity: 78,
    })
    expect(result.fetchedAt).toBe('2026-07-28T07:12:30+09:00')
  })

  it('출발과 귀가는 맑아도 외출 중간의 비를 찾는다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-28', '09:00'),
        ...point('2026-07-28', '12:00', {
          PTY: 1,
          PCP: '1mm 미만',
          POP: 70,
        }),
        ...point('2026-07-28', '18:00'),
      ]),
    )
    const result = summarizeKmaForecast(dataset, {
      forecastDate: '2026-07-28',
      departureTime: '09:00',
      returnTime: '18:00',
    })

    expect(result.departure.hasPrecipitation).toBe(false)
    expect(result.return.hasPrecipitation).toBe(false)
    expect(result.period.hasPrecipitation).toBe(true)
    expect(result.period.precipitationTypes).toEqual(['rain'])
  })

  it('POP만 높으면 비 있음으로 확정하지 않는다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-28', '09:00', { POP: 80 }),
        ...point('2026-07-28', '18:00', { POP: 90 }),
      ]),
    )
    const result = summarizeKmaForecast(dataset, {
      forecastDate: '2026-07-28',
      departureTime: '09:00',
      returnTime: '18:00',
    })

    expect(result.period.maxPrecipitationProbability).toBe(90)
    expect(result.period.hasPrecipitation).toBe(false)
  })

  it('문자열 강수량과 눈을 강수 근거로 보존한다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-28', '09:00', {
          PTY: 3,
          PCP: '30.0~50.0mm',
          SNO: '0.5cm 미만',
        }),
      ]),
    )
    const result = summarizeKmaForecast(dataset, {
      forecastDate: '2026-07-28',
      departureTime: '09:00',
      returnTime: '09:00',
    })

    expect(result.departure.precipitationAmount).toEqual({
      value: null,
      label: '30.0~50.0mm',
      hasAmount: true,
    })
    expect(result.departure.snowAmount).toEqual({
      value: null,
      label: '0.5cm 미만',
      hasAmount: true,
    })
    expect(result.period.precipitationTypes).toEqual(['snow'])
  })

  it('귀가 시각이 이르면 다음 날 귀가로 해석한다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-28', '22:00', { TMP: 21 }),
        ...point('2026-07-29', '00:00', { TMP: 19 }),
        ...point('2026-07-29', '01:00', { TMP: 18 }),
      ]),
    )
    const result = summarizeKmaForecast(dataset, {
      forecastDate: '2026-07-28',
      departureTime: '22:00',
      returnTime: '01:00',
    })

    expect(result.departure.at).toBe('2026-07-28T22:00:00+09:00')
    expect(result.return.at).toBe('2026-07-29T01:00:00+09:00')
    expect(result.return.temperature).toBe(18)
  })

  it('category 일부가 없으면 해당 값만 null과 warning으로 남긴다', () => {
    const values = point('2026-07-28', '09:00').filter(
      ({ category }) => category !== 'REH' && category !== 'WSD',
    )
    const dataset = parseKmaVilageForecastResponse(response(values))
    const result = summarizeKmaForecast(dataset, {
      forecastDate: '2026-07-28',
      departureTime: '09:00',
      returnTime: '09:00',
    })

    expect(result.departure.temperature).toBe(20)
    expect(result.departure.humidity).toBeNull()
    expect(result.departure.windSpeed).toBeNull()
    expect(result.warnings).toContain('departure:REH')
    expect(result.warnings).toContain('return:WSD')
  })

  it('기상청 Missing sentinel과 단위가 붙은 0을 정보 없음으로 처리한다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([
        ...point('2026-07-28', '09:00', {
          TMP: 999,
          REH: -999,
          PCP: '0.0mm',
          SNO: '+900',
        }),
      ]),
    )
    const result = summarizeKmaForecast(dataset, {
      forecastDate: '2026-07-28',
      departureTime: '09:00',
      returnTime: '09:00',
    })

    expect(result.departure.temperature).toBeNull()
    expect(result.departure.humidity).toBeNull()
    expect(result.departure.precipitationAmount.hasAmount).toBe(false)
    expect(result.departure.snowAmount.hasAmount).toBe(false)
  })

  it('선택 시각의 point가 없으면 날씨 적용을 차단한다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([...point('2026-07-28', '09:00')]),
    )

    expect(
      errorCode(() =>
        summarizeKmaForecast(dataset, {
          forecastDate: '2026-07-28',
          departureTime: '09:00',
          returnTime: '18:00',
        }),
      ),
    ).toBe('missing-forecast-time')
  })

  it('존재하지 않는 날짜는 요청 오류로 구분한다', () => {
    const dataset = parseKmaVilageForecastResponse(
      response([...point('2026-07-28', '09:00')]),
    )

    expect(
      errorCode(() =>
        summarizeKmaForecast(dataset, {
          forecastDate: '2026-02-30',
          departureTime: '09:00',
          returnTime: '09:00',
        }),
      ),
    ).toBe('invalid-request')
  })
})
