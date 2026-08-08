import { useEffect, useMemo, useState } from 'react'
import type { ClosetRepository } from '../../data/repository'
import {
  LOCAL_P5A_DIRECT_EVIDENCE_E2_ENABLED,
  rankHomeRecommendationsWithDirectEvidenceE2,
} from '../../lib/direct-evidence-home-ranking'
import {
  applyRecentPurchaseW2Home,
  LOCAL_P5A_RECENT_PURCHASE_W2_ENABLED,
} from '../../lib/recent-purchase-w2-home'
import type { WeatherRecommendationProvenance } from '../../lib/navigation'
import {
  partitionRecommendations,
  recommendOutfits,
} from '../../lib/recommendation'
import {
  outfitMatchesSeasonScope,
  type Season,
} from '../../lib/seasons'
import type {
  AppData,
  ConditionChoice,
  RecommendationInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
} from '../../lib/types'
import { recommendationInputFromWeather } from '../../lib/weather-recommendation'

export type HomeConditionChoice = Exclude<ConditionChoice, 'unknown'>
type InputSource = 'manual' | 'weather' | 'weather-edited'

interface StoredForecast {
  request: WeatherForecastRequest
  response: WeatherForecastResponse
}

interface HomeSessionState {
  tempOut: string
  tempBack: string
  rainCondition: HomeConditionChoice
  longWalkCondition: HomeConditionChoice
  placeId: string
  transportModeId: string
  submitted: RecommendationInput | null
  forecastDate: string
  departureTime: string
  returnTime: string
  forecast: StoredForecast | null
  inputSource: InputSource
  weatherBaseline: WeatherRecommendationProvenance | null
  submittedWeather: WeatherRecommendationProvenance | null
}

const defaultInput: RecommendationInput = {
  tempOut: 20,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: null,
  transportModeId: null,
}

const HOME_SESSION_KEY = 'closet-index:home-weather:v2'
const HOME_LOCAL_STORAGE_KEY = 'closet-index:home-weather:v3'
export const RECOMMENDATION_PAGE_SIZE = 3
const LOCAL_P5A_CONTEXT_RANKING_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_P5A_CONTEXT_RANKING === 'true'
const LOCAL_P5A_TRANSPORT_POLICY_B_ENABLED =
  import.meta.env.DEV &&
  import.meta.env.VITE_P5A_TRANSPORT_POLICY_B === 'true'

export const homeConditionValues: HomeConditionChoice[] = ['no', 'yes']
export const hourOptions = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, '0')}:00`,
)

export function kstDate(daysFromToday = 0) {
  const now = Date.now() + 9 * 60 * 60 * 1000
  const shifted = new Date(now + daysFromToday * 24 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

export function formatForecastTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export function temperatureLabel(value: number | null) {
  return value === null ? '정보 없음' : `${value}°C`
}

export function humidityLabel(min: number | null, max: number | null) {
  if (min === null && max === null) return '정보 없음'
  if (min === max || max === null) return `${min}%`
  if (min === null) return `${max}%`
  return `${min}~${max}%`
}

function defaultSessionState(): HomeSessionState {
  return {
    tempOut: String(defaultInput.tempOut),
    tempBack: '',
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId: '',
    transportModeId: '',
    submitted: null,
    forecastDate: kstDate(),
    departureTime: '20:00',
    returnTime: '00:00',
    forecast: null,
    inputSource: 'manual',
    weatherBaseline: null,
    submittedWeather: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeHomeState(
  value: unknown,
  fallback: HomeSessionState,
): HomeSessionState {
  if (!isRecord(value)) return fallback

  const condition = (candidate: unknown, defaultValue: HomeConditionChoice) =>
    candidate === 'yes' || candidate === 'no' ? candidate : defaultValue
  const source = (candidate: unknown): InputSource =>
    candidate === 'weather' || candidate === 'weather-edited'
      ? candidate
      : 'manual'

  return {
    tempOut:
      typeof value.tempOut === 'string' ? value.tempOut : fallback.tempOut,
    tempBack:
      typeof value.tempBack === 'string' ? value.tempBack : fallback.tempBack,
    rainCondition: condition(value.rainCondition, fallback.rainCondition),
    longWalkCondition: condition(
      value.longWalkCondition,
      fallback.longWalkCondition,
    ),
    placeId:
      typeof value.placeId === 'string' ? value.placeId : fallback.placeId,
    transportModeId:
      typeof value.transportModeId === 'string'
        ? value.transportModeId
        : fallback.transportModeId,
    submitted:
      value.submitted === null || isRecord(value.submitted)
        ? (value.submitted as RecommendationInput | null)
        : fallback.submitted,
    forecastDate:
      typeof value.forecastDate === 'string'
        ? value.forecastDate
        : fallback.forecastDate,
    departureTime:
      typeof value.departureTime === 'string'
        ? value.departureTime
        : fallback.departureTime,
    returnTime:
      typeof value.returnTime === 'string'
        ? value.returnTime
        : fallback.returnTime,
    forecast:
      value.forecast === null || isRecord(value.forecast)
        ? (value.forecast as unknown as StoredForecast | null)
        : fallback.forecast,
    inputSource: source(value.inputSource),
    weatherBaseline:
      value.weatherBaseline === null || isRecord(value.weatherBaseline)
        ? (value.weatherBaseline as WeatherRecommendationProvenance | null)
        : fallback.weatherBaseline,
    submittedWeather:
      value.submittedWeather === null || isRecord(value.submittedWeather)
        ? (value.submittedWeather as WeatherRecommendationProvenance | null)
        : fallback.submittedWeather,
  }
}

function readHomeSessionState(): HomeSessionState {
  const fallback = defaultSessionState()

  try {
    const stored = window.localStorage.getItem(HOME_LOCAL_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as unknown
      if (
        isRecord(parsed) &&
        parsed.savedOn === kstDate() &&
        isRecord(parsed.state)
      ) {
        return normalizeHomeState(parsed.state, fallback)
      }
    }
  } catch {
    // Fall through to the same-tab session copy.
  }

  try {
    const stored = window.sessionStorage.getItem(HOME_SESSION_KEY)
    if (!stored) return fallback
    const parsed = JSON.parse(stored) as unknown
    if (
      isRecord(parsed) &&
      parsed.savedOn === kstDate() &&
      isRecord(parsed.state)
    ) {
      return normalizeHomeState(parsed.state, fallback)
    }
    if (isRecord(parsed) && parsed.forecastDate === kstDate()) {
      return normalizeHomeState(parsed, fallback)
    }
    return fallback
  } catch {
    return fallback
  }
}

function requestKey(request: WeatherForecastRequest) {
  return [
    request.locationId,
    request.forecastDate,
    request.departureTime,
    request.returnTime,
  ].join('|')
}

function weatherProvenance(
  response: WeatherForecastResponse,
  input: RecommendationInput,
): WeatherRecommendationProvenance {
  return {
    locationId: response.location.id,
    issuedAt: response.issuedAt,
    tempOut: input.tempOut,
    tempBack: input.tempBack,
    rainCondition: input.rainCondition,
    overridden: false,
  }
}

function weatherInputChanged(
  input: RecommendationInput,
  baseline: WeatherRecommendationProvenance,
) {
  return (
    input.tempOut !== baseline.tempOut ||
    input.tempBack !== baseline.tempBack ||
    input.rainCondition !== baseline.rainCondition
  )
}

function parseTemperature(value: string) {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= -50 && number <= 60
    ? number
    : NaN
}

interface UseHomeRecommendationOptions {
  data: AppData | null
  activeSeasons: Season[]
  fetchWeatherForecast: ClosetRepository['fetchWeatherForecast']
}

export function useHomeRecommendation({
  data,
  activeSeasons,
  fetchWeatherForecast,
}: UseHomeRecommendationOptions) {
  const [initialState] = useState(readHomeSessionState)
  const [tempOut, setTempOut] = useState(initialState.tempOut)
  const [tempBack, setTempBack] = useState(initialState.tempBack)
  const [rainCondition, setRainCondition] =
    useState<HomeConditionChoice>(initialState.rainCondition)
  const [longWalkCondition, setLongWalkCondition] =
    useState<HomeConditionChoice>(initialState.longWalkCondition)
  const [placeId, setPlaceId] = useState(initialState.placeId)
  const [transportModeId, setTransportModeId] = useState(
    initialState.transportModeId,
  )
  const [submitted, setSubmitted] = useState<RecommendationInput | null>(
    initialState.submitted,
  )
  const [forecastDate, setForecastDate] = useState(initialState.forecastDate)
  const [departureTime, setDepartureTime] = useState(initialState.departureTime)
  const [returnTime, setReturnTime] = useState(initialState.returnTime)
  const [storedForecast, setStoredForecast] = useState<StoredForecast | null>(
    initialState.forecast,
  )
  const [inputSource, setInputSource] = useState<InputSource>(
    initialState.inputSource,
  )
  const [weatherBaseline, setWeatherBaseline] =
    useState<WeatherRecommendationProvenance | null>(
      initialState.weatherBaseline,
    )
  const [submittedWeather, setSubmittedWeather] =
    useState<WeatherRecommendationProvenance | null>(
      initialState.submittedWeather,
    )
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [visibleRecommendationCount, setVisibleRecommendationCount] = useState(
    RECOMMENDATION_PAGE_SIZE,
  )
  const [visibleTrialCount, setVisibleTrialCount] = useState(
    RECOMMENDATION_PAGE_SIZE,
  )

  const defaultWeatherLocation = useMemo(
    () =>
      data?.weatherLocations?.find((location) => location.isDefault) ??
      data?.weatherLocations?.[0] ??
      null,
    [data?.weatherLocations],
  )
  const currentWeatherRequest = useMemo<WeatherForecastRequest | null>(
    () =>
      defaultWeatherLocation
        ? {
            locationId: defaultWeatherLocation.id,
            forecastDate,
            departureTime,
            returnTime,
          }
        : null,
    [defaultWeatherLocation, departureTime, forecastDate, returnTime],
  )
  const visibleForecast =
    storedForecast &&
    currentWeatherRequest &&
    requestKey(storedForecast.request) === requestKey(currentWeatherRequest)
      ? storedForecast.response
      : null

  useEffect(() => {
    const state: HomeSessionState = {
      tempOut,
      tempBack,
      rainCondition,
      longWalkCondition,
      placeId,
      transportModeId,
      submitted,
      forecastDate,
      departureTime,
      returnTime,
      forecast: storedForecast,
      inputSource,
      weatherBaseline,
      submittedWeather,
    }
    try {
      const storedState = JSON.stringify({ savedOn: kstDate(), state })
      window.sessionStorage.setItem(HOME_SESSION_KEY, storedState)
      window.localStorage.setItem(HOME_LOCAL_STORAGE_KEY, storedState)
    } catch {
      // Storage can be unavailable in private browsing; HOME still works in memory.
    }
  }, [
    departureTime,
    forecastDate,
    inputSource,
    longWalkCondition,
    placeId,
    rainCondition,
    returnTime,
    storedForecast,
    submittedWeather,
    submitted,
    tempBack,
    tempOut,
    transportModeId,
    weatherBaseline,
  ])

  const { recentPurchases, recommendations, trialRecommendations } = useMemo(
    () => {
      const scopedData = data
        ? {
            ...data,
            outfits: data.outfits.filter((outfit) =>
              outfitMatchesSeasonScope(outfit, data.items, activeSeasons),
            ),
          }
        : null
      const results =
        scopedData && submitted
          ? recommendOutfits(scopedData, submitted, {
              enableContextRanking: LOCAL_P5A_CONTEXT_RANKING_ENABLED,
              enableTransportThermalPolicyB:
                LOCAL_P5A_TRANSPORT_POLICY_B_ENABLED,
            })
          : []
      const baselineGroups = partitionRecommendations(results)
      if (!scopedData || !submitted) return baselineGroups
      const recencyBoundedGroups = applyRecentPurchaseW2Home({
        data: scopedData,
        input: submitted,
        results,
        baselineGroups,
        enabled: LOCAL_P5A_RECENT_PURCHASE_W2_ENABLED,
      }).groups
      return rankHomeRecommendationsWithDirectEvidenceE2(
        scopedData,
        submitted,
        recencyBoundedGroups,
        LOCAL_P5A_DIRECT_EVIDENCE_E2_ENABLED,
      ).groups
    },
    [activeSeasons, data, submitted],
  )

  const markManualEdit = () => {
    setInputSource((current) =>
      current === 'weather' ? 'weather-edited' : current,
    )
  }
  const clearWeatherFeedback = () => {
    setWeatherError(null)
    setWeatherStatus(null)
  }
  const resetRecommendationLists = () => {
    setVisibleRecommendationCount(RECOMMENDATION_PAGE_SIZE)
    setVisibleTrialCount(RECOMMENDATION_PAGE_SIZE)
  }

  useEffect(() => {
    resetRecommendationLists()
  }, [activeSeasons])

  const applyForecast = (
    forecast: WeatherForecastResponse,
    status = '기상청 예보를 추천 조건에 적용했습니다.',
  ) => {
    let next: RecommendationInput
    try {
      next = recommendationInputFromWeather(forecast, {
        longWalkCondition,
        placeId: placeId || null,
        transportModeId: transportModeId || null,
      })
    } catch (cause) {
      setWeatherError(
        cause instanceof Error
          ? cause.message
          : '예보를 추천 조건으로 바꾸지 못했습니다.',
      )
      return
    }
    setTempOut(String(next.tempOut))
    setTempBack(next.tempBack === null ? '' : String(next.tempBack))
    setRainCondition(next.rainCondition === 'yes' ? 'yes' : 'no')
    setInputSource('weather')
    setSubmitted(next)
    const provenance = weatherProvenance(forecast, next)
    setWeatherBaseline(provenance)
    setSubmittedWeather(provenance)
    setValidationError(null)
    setWeatherError(null)
    setWeatherStatus(status)
    resetRecommendationLists()
  }

  const loadWeather = async () => {
    if (!currentWeatherRequest) {
      setWeatherError('Settings에서 기본 날씨 위치를 먼저 저장해 주세요.')
      return
    }

    clearWeatherFeedback()
    if (
      storedForecast &&
      requestKey(storedForecast.request) === requestKey(currentWeatherRequest)
    ) {
      applyForecast(
        storedForecast.response,
        '이 탭에 저장된 같은 예보를 추천 조건에 적용했습니다.',
      )
      return
    }

    setWeatherLoading(true)
    try {
      const response = await fetchWeatherForecast(currentWeatherRequest)
      setStoredForecast({ request: currentWeatherRequest, response })
      applyForecast(response)
    } catch (cause) {
      setWeatherError(
        cause instanceof Error
          ? cause.message
          : '날씨를 불러오지 못했습니다. 직접 입력으로 계속할 수 있습니다.',
      )
    } finally {
      setWeatherLoading(false)
    }
  }

  const restoreForecast = () => {
    if (!visibleForecast || visibleForecast.departure.temperature === null) return
    const restored = recommendationInputFromWeather(visibleForecast, {
      longWalkCondition,
      placeId: placeId || null,
      transportModeId: transportModeId || null,
    })
    setTempOut(String(restored.tempOut))
    setTempBack(restored.tempBack === null ? '' : String(restored.tempBack))
    setRainCondition(restored.rainCondition === 'yes' ? 'yes' : 'no')
    setInputSource('weather')
    setWeatherBaseline(weatherProvenance(visibleForecast, restored))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const parsedOut = parseTemperature(tempOut)
    const parsedBack = parseTemperature(tempBack)
    if (parsedOut === null || Number.isNaN(parsedOut)) {
      setValidationError('출발 온도는 -50~60 사이의 정수로 입력해 주세요.')
      return
    }
    if (Number.isNaN(parsedBack)) {
      setValidationError(
        '귀가 온도는 비워 두거나 -50~60 사이의 정수로 입력해 주세요.',
      )
      return
    }

    setValidationError(null)
    resetRecommendationLists()
    const next: RecommendationInput = {
      tempOut: parsedOut,
      tempBack: parsedBack,
      rainCondition,
      longWalkCondition,
      placeId: placeId || null,
      transportModeId: transportModeId || null,
    }
    setSubmitted(next)
    setSubmittedWeather(
      inputSource !== 'manual' && weatherBaseline
        ? {
            ...weatherBaseline,
            overridden:
              weatherBaseline.overridden ||
              weatherInputChanged(next, weatherBaseline),
          }
        : null,
    )
  }

  return {
    tempOut,
    setTempOut,
    tempBack,
    setTempBack,
    rainCondition,
    setRainCondition,
    longWalkCondition,
    setLongWalkCondition,
    placeId,
    setPlaceId,
    transportModeId,
    setTransportModeId,
    submitted,
    submittedWeather,
    forecastDate,
    setForecastDate,
    departureTime,
    setDepartureTime,
    returnTime,
    setReturnTime,
    inputSource,
    weatherLoading,
    weatherError,
    weatherStatus,
    validationError,
    defaultWeatherLocation,
    visibleForecast,
    recentPurchases,
    recommendations,
    trialRecommendations,
    visibleRecommendationCount,
    setVisibleRecommendationCount,
    visibleTrialCount,
    setVisibleTrialCount,
    markManualEdit,
    clearWeatherFeedback,
    loadWeather,
    restoreForecast,
    submit,
  }
}
