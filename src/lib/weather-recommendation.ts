import type {
  ConditionChoice,
  RecommendationInput,
  WeatherForecastResponse,
} from './types'

export interface WeatherRecommendationContext {
  longWalkCondition: ConditionChoice
  placeId: string | null
  transportModeId: string | null
}

export function recommendationInputFromWeather(
  forecast: WeatherForecastResponse,
  context: WeatherRecommendationContext,
): RecommendationInput {
  if (forecast.departure.temperature === null) {
    throw new Error(
      '출발 온도 정보가 없어 적용할 수 없습니다. 직접 입력으로 계속해 주세요.',
    )
  }

  return {
    tempOut: forecast.departure.temperature,
    tempBack: forecast.return.temperature,
    rainCondition: forecast.period.hasPrecipitation ? 'yes' : 'no',
    longWalkCondition: context.longWalkCondition,
    placeId: context.placeId,
    transportModeId: context.transportModeId,
  }
}
