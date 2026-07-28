import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demo-data'
import { recommendOutfits } from './recommendation'
import type {
  RecommendationInput,
  WeatherForecastPoint,
  WeatherForecastResponse,
} from './types'
import { recommendationInputFromWeather } from './weather-recommendation'

function point(
  time: string,
  temperature: number | null,
  overrides: Partial<WeatherForecastPoint> = {},
): WeatherForecastPoint {
  return {
    at: `2026-07-29T${time}:00+09:00`,
    temperature,
    humidity: 70,
    precipitationProbability: 20,
    precipitationType: 'none',
    precipitationAmount: { value: null, label: null, hasAmount: false },
    snowAmount: { value: null, label: null, hasAmount: false },
    sky: 'mostly-cloudy',
    windSpeed: 1.5,
    hasPrecipitation: false,
    missingCategories: [],
    ...overrides,
  }
}

function forecast(
  tempOut: number | null,
  tempBack: number | null,
  overrides: {
    hasPrecipitation?: boolean
    maxPrecipitationProbability?: number | null
    departure?: Partial<WeatherForecastPoint>
    return?: Partial<WeatherForecastPoint>
  } = {},
): WeatherForecastResponse {
  return {
    source: 'kma-vilage-fcst',
    issuedAt: '2026-07-29T05:00:00+09:00',
    fetchedAt: '2026-07-29T08:00:00+09:00',
    nx: 61,
    ny: 129,
    location: { id: 'location', label: '창4동' },
    departure: point('09:00', tempOut, overrides.departure),
    return: point('18:00', tempBack, overrides.return),
    period: {
      hasPrecipitation: overrides.hasPrecipitation ?? false,
      precipitationTypes: overrides.hasPrecipitation ? ['rain'] : [],
      maxPrecipitationProbability:
        overrides.maxPrecipitationProbability ?? 30,
      minHumidity: 62,
      maxHumidity: 78,
    },
    stale: false,
    warnings: [],
  }
}

const context = {
  longWalkCondition: 'no' as const,
  placeId: null,
  transportModeId: null,
}

describe('recommendationInputFromWeather', () => {
  it('같은 온도·비 조건의 수동 입력과 완전히 같은 추천 순서를 만든다', () => {
    const weatherInput = recommendationInputFromWeather(
      forecast(20, 20),
      context,
    )
    const manualInput: RecommendationInput = {
      tempOut: 20,
      tempBack: 20,
      rainCondition: 'no',
      longWalkCondition: 'no',
      placeId: null,
      transportModeId: null,
    }

    const weatherResults = recommendOutfits(demoData, weatherInput)
    const manualResults = recommendOutfits(demoData, manualInput)

    expect(weatherInput).toEqual(manualInput)
    expect(weatherResults.map((result) => result.outfit.id)).toEqual(
      manualResults.map((result) => result.outfit.id),
    )
    expect(
      weatherResults.map(({ outfit, level, warnings, targetTemp }) => ({
        id: outfit.id,
        level,
        warnings,
        targetTemp,
      })),
    ).toEqual(
      manualResults.map(({ outfit, level, warnings, targetTemp }) => ({
        id: outfit.id,
        level,
        warnings,
        targetTemp,
      })),
    )
  })

  it('평균값이 같아도 출발·귀가 온도를 보존해 끝점 경고를 유지한다', () => {
    const endpointInput = recommendationInputFromWeather(
      forecast(18, 14),
      context,
    )
    const flatInput: RecommendationInput = {
      ...endpointInput,
      tempOut: 16,
      tempBack: 16,
    }

    const endpointResult = recommendOutfits(demoData, endpointInput).find(
      (result) => result.outfit.id === 'outfit-favorite',
    )
    const flatResult = recommendOutfits(demoData, flatInput).find(
      (result) => result.outfit.id === 'outfit-favorite',
    )

    expect(endpointResult?.targetTemp).toBe(16)
    expect(flatResult?.targetTemp).toBe(16)
    expect(endpointResult?.warnings).toContain(
      '귀가 14°C — 15°C에서 추웠던 기록 있음',
    )
    expect(flatResult?.warnings).not.toContain(
      '귀가 14°C — 15°C에서 추웠던 기록 있음',
    )
  })

  it('구간 강수가 있으면 비 조건을 제안하고 비 부적합 경고를 재사용한다', () => {
    const input = recommendationInputFromWeather(
      forecast(20, 18, { hasPrecipitation: true }),
      context,
    )
    const result = recommendOutfits(demoData, input).find(
      (entry) => entry.outfit.id === 'outfit-favorite',
    )

    expect(input.rainCondition).toBe('yes')
    expect(
      result?.warnings.some((warning) => warning.includes('비에 부적합')),
    ).toBe(true)
  })

  it('강수확률만 높고 실제 구간 강수가 없으면 비로 확정하지 않는다', () => {
    const input = recommendationInputFromWeather(
      forecast(20, 18, {
        hasPrecipitation: false,
        maxPrecipitationProbability: 90,
      }),
      context,
    )
    const result = recommendOutfits(demoData, input).find(
      (entry) => entry.outfit.id === 'outfit-favorite',
    )

    expect(input.rainCondition).toBe('no')
    expect(
      result?.warnings.some((warning) => warning.includes('비에 부적합')),
    ).toBe(false)
  })

  it('습도와 풍속은 추천 입력을 변경하지 않는다', () => {
    const calm = recommendationInputFromWeather(forecast(20, 18), context)
    const humidAndWindy = recommendationInputFromWeather(
      forecast(20, 18, {
        departure: { humidity: 98, windSpeed: 12 },
        return: { humidity: 95, windSpeed: 10 },
      }),
      context,
    )

    expect(humidAndWindy).toEqual(calm)
  })

  it('출발 온도가 없으면 날씨 적용을 차단한다', () => {
    expect(() =>
      recommendationInputFromWeather(forecast(null, 18), context),
    ).toThrow('출발 온도 정보가 없어 적용할 수 없습니다.')
  })
})
