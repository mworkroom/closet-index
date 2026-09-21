export interface TemperatureRange {
  min: number
  max: number
}

export const RECOMMENDATION_TEMPERATURE_TOLERANCE = 2

export function temperatureRangeFor(
  temperatures: readonly number[],
): TemperatureRange | null {
  if (temperatures.length === 0) return null

  let min = temperatures[0]
  let max = temperatures[0]
  for (const temperature of temperatures.slice(1)) {
    min = Math.min(min, temperature)
    max = Math.max(max, temperature)
  }
  return { min, max }
}

export function expandTemperatureRange(
  range: TemperatureRange | null,
  tolerance = RECOMMENDATION_TEMPERATURE_TOLERANCE,
): TemperatureRange | null {
  return range
    ? {
        min: range.min - tolerance,
        max: range.max + tolerance,
      }
    : null
}

export function recommendationTemperatureRangeFor(result: {
  okRange: TemperatureRange | null
  recommendationRange?: TemperatureRange | null
}) {
  return result.recommendationRange ?? expandTemperatureRange(result.okRange)
}

export function temperatureRangeContains(
  range: TemperatureRange | null,
  temperature: number,
) {
  return Boolean(
    range && temperature >= range.min && temperature <= range.max,
  )
}

export function temperatureRangeDistance(
  temperature: number,
  range: TemperatureRange | null,
) {
  if (!range) return Number.POSITIVE_INFINITY
  if (temperature < range.min) return range.min - temperature
  if (temperature > range.max) return temperature - range.max
  return 0
}

export function formatTemperatureRange(
  range: TemperatureRange,
  separator = '~',
) {
  return range.min === range.max
    ? `${range.min}°C`
    : `${range.min}${separator}${range.max}°C`
}
