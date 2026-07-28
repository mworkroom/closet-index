import {
  CalendarDays,
  CloudRain,
  CloudSun,
  Footprints,
  RefreshCw,
  Search,
  Thermometer,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { OutfitCard } from '../components/OutfitCard'
import { useClosetData } from '../context/DataContext'
import type { WeatherRecommendationProvenance } from '../lib/navigation'
import {
  partitionRecommendations,
  recommendOutfits,
} from '../lib/recommendation'
import { recommendationInputFromWeather } from '../lib/weather-recommendation'
import type {
  ConditionChoice,
  RecommendationInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
} from '../lib/types'
import { conditionLabels } from '../lib/types'

type HomeConditionChoice = Exclude<ConditionChoice, 'unknown'>

const homeConditionValues: HomeConditionChoice[] = ['no', 'yes']

const defaultInput: RecommendationInput = {
  tempOut: 20,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: null,
  transportModeId: null,
}

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

const HOME_SESSION_KEY = 'closet-index:home-weather:v1'

function kstDate(daysFromToday = 0) {
  const now = Date.now() + 9 * 60 * 60 * 1000
  const shifted = new Date(now + daysFromToday * 24 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
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
    departureTime: '09:00',
    returnTime: '18:00',
    forecast: null,
    inputSource: 'manual',
    weatherBaseline: null,
    submittedWeather: null,
  }
}

function readHomeSessionState(): HomeSessionState {
  const fallback = defaultSessionState()
  try {
    const stored = window.sessionStorage.getItem(HOME_SESSION_KEY)
    if (!stored) return fallback
    const parsed = JSON.parse(stored) as Partial<HomeSessionState>
    return { ...fallback, ...parsed }
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

function formatForecastTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function temperatureLabel(value: number | null) {
  return value === null ? '정보 없음' : `${value}°C`
}

function humidityLabel(min: number | null, max: number | null) {
  if (min === null && max === null) return '정보 없음'
  if (min === max || max === null) return `${min}%`
  if (min === null) return `${max}%`
  return `${min}~${max}%`
}

const hourOptions = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, '0')}:00`,
)

function parseTemperature(value: string) {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= -50 && number <= 60 ? number : NaN
}

export function HomePage() {
  const {
    data,
    loading,
    error,
    refresh,
    fetchWeatherForecast,
  } = useClosetData()
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
  const [showAll, setShowAll] = useState(false)
  const [showAllTrials, setShowAllTrials] = useState(false)
  const [showAllUnknownTrials, setShowAllUnknownTrials] = useState(false)

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
    window.sessionStorage.setItem(HOME_SESSION_KEY, JSON.stringify(state))
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

  const {
    recentPurchases,
    recommendations,
    trialRecommendations,
    unknownTrialRecommendations,
  } = useMemo(() => {
    const results = data && submitted ? recommendOutfits(data, submitted) : []
    return partitionRecommendations(results)
  }, [data, submitted])

  const markManualEdit = () => {
    setInputSource((current) =>
      current === 'weather' ? 'weather-edited' : current,
    )
  }

  const resetRecommendationLists = () => {
    setShowAll(false)
    setShowAllTrials(false)
    setShowAllUnknownTrials(false)
  }

  const loadWeather = async () => {
    if (!currentWeatherRequest) {
      setWeatherError('Settings에서 기본 날씨 위치를 먼저 저장해 주세요.')
      return
    }

    setWeatherError(null)
    setWeatherStatus(null)
    if (
      storedForecast &&
      requestKey(storedForecast.request) === requestKey(currentWeatherRequest)
    ) {
      setWeatherStatus('이 탭에 저장된 같은 예보를 다시 사용했습니다.')
      return
    }

    setWeatherLoading(true)
    try {
      const response = await fetchWeatherForecast(currentWeatherRequest)
      setStoredForecast({ request: currentWeatherRequest, response })
      setWeatherStatus('예보를 불러왔습니다. 확인 후 추천에 적용해 주세요.')
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

  const applyForecast = () => {
    if (!visibleForecast) return

    let next: RecommendationInput
    try {
      next = recommendationInputFromWeather(visibleForecast, {
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
    const provenance = weatherProvenance(visibleForecast, next)
    setWeatherBaseline(provenance)
    setSubmittedWeather(provenance)
    setValidationError(null)
    setWeatherError(null)
    setWeatherStatus('기상청 예보를 추천 조건에 적용했습니다.')
    resetRecommendationLists()
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
      setValidationError('귀가 온도는 비워 두거나 -50~60 사이의 정수로 입력해 주세요.')
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

  return (
    <AppShell title="오늘 뭐 입지?" eyebrow="CLOSET INDEX">
      <section className="hero-copy">
        <p>오늘의 조건과 실제 착용 기록을 비교해 이미 검증한 착장을 찾습니다.</p>
      </section>

      <section className="weather-panel" aria-labelledby="weather-panel-title">
        <div className="weather-panel__heading">
          <div>
            <p className="eyebrow">KMA FORECAST</p>
            <h2 id="weather-panel-title">날씨 불러오기</h2>
          </div>
          <CloudSun size={24} aria-hidden="true" />
        </div>

        {defaultWeatherLocation ? (
          <>
            <p className="weather-panel__location">
              <strong>{defaultWeatherLocation.label}</strong>
              <span>기본 예보 위치</span>
            </p>
            <div className="weather-query-grid">
              <label className="field weather-query-grid__date">
                <span>
                  <CalendarDays size={17} aria-hidden="true" />
                  날짜
                </span>
                <input
                  type="date"
                  min={kstDate()}
                  max={kstDate(4)}
                  value={forecastDate}
                  onChange={(event) => {
                    setForecastDate(event.target.value)
                    setWeatherError(null)
                    setWeatherStatus(null)
                  }}
                />
              </label>
              <label className="field">
                <span>출발</span>
                <select
                  value={departureTime}
                  onChange={(event) => {
                    setDepartureTime(event.target.value)
                    setWeatherError(null)
                    setWeatherStatus(null)
                  }}
                >
                  {hourOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>귀가</span>
                <select
                  value={returnTime}
                  onChange={(event) => {
                    setReturnTime(event.target.value)
                    setWeatherError(null)
                    setWeatherStatus(null)
                  }}
                >
                  {hourOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="button button--secondary button--wide"
              type="button"
              onClick={() => void loadWeather()}
              disabled={weatherLoading}
            >
              {weatherLoading ? (
                <>
                  <span className="spinner spinner--small" aria-hidden="true" />
                  불러오는 중
                </>
              ) : (
                <>
                  <RefreshCw size={18} aria-hidden="true" />
                  날씨 불러오기
                </>
              )}
            </button>
          </>
        ) : (
          <div className="weather-panel__empty">
            <p>기본 날씨 위치가 아직 없습니다.</p>
            <Link className="button button--secondary" to="/settings">
              Settings에서 위치 저장
            </Link>
          </div>
        )}

        {visibleForecast && (
          <div className="weather-result">
            <div className="weather-result__temperatures">
              <div>
                <span>출발</span>
                <strong>{temperatureLabel(visibleForecast.departure.temperature)}</strong>
              </div>
              <div>
                <span>귀가</span>
                <strong>{temperatureLabel(visibleForecast.return.temperature)}</strong>
              </div>
              <div>
                <span>평균</span>
                <strong>
                  {visibleForecast.departure.temperature !== null &&
                  visibleForecast.return.temperature !== null
                    ? `${Math.round(
                        (visibleForecast.departure.temperature +
                          visibleForecast.return.temperature) /
                          2,
                      )}°C`
                    : '정보 없음'}
                </strong>
              </div>
            </div>
            <dl className="weather-result__details">
              <div>
                <dt>외출 중 강수</dt>
                <dd>
                  {visibleForecast.period.hasPrecipitation
                    ? '비·눈 예보 있음'
                    : '예보 없음'}
                </dd>
              </div>
              <div>
                <dt>최대 강수확률</dt>
                <dd>
                  {visibleForecast.period.maxPrecipitationProbability === null
                    ? '정보 없음'
                    : `${visibleForecast.period.maxPrecipitationProbability}%`}
                </dd>
              </div>
              <div>
                <dt>습도</dt>
                <dd>
                  {humidityLabel(
                    visibleForecast.period.minHumidity,
                    visibleForecast.period.maxHumidity,
                  )}
                </dd>
              </div>
            </dl>
            <p className="weather-result__issued">
              기상청 {formatForecastTime(visibleForecast.issuedAt)} 발표
            </p>
            <button
              className="button button--primary button--wide"
              type="button"
              onClick={applyForecast}
              disabled={visibleForecast.departure.temperature === null}
            >
              이 날씨로 추천 보기
            </button>
          </div>
        )}

        {weatherError && (
          <div className="weather-panel__feedback weather-panel__feedback--error" role="alert">
            <strong>날씨를 불러오지 못했어요.</strong>
            <p>{weatherError}</p>
            <a href="#manual-conditions">직접 입력으로 계속하기</a>
          </div>
        )}
        {weatherStatus && (
          <p className="weather-panel__feedback" role="status">
            {weatherStatus}
          </p>
        )}
      </section>

      <form
        className="panel condition-form"
        id="manual-conditions"
        onSubmit={submit}
      >
        <div className="condition-form__source">
          <span>
            {inputSource === 'weather'
              ? '기상청 예보'
              : inputSource === 'weather-edited'
                ? '기상청 예보에서 직접 수정'
                : '직접 입력'}
          </span>
          {visibleForecast && inputSource !== 'manual' && (
            <button type="button" onClick={restoreForecast}>
              예보값으로 되돌리기
            </button>
          )}
        </div>
        <div className="field-grid field-grid--two">
          <label className="field">
            <span>
              <Thermometer size={17} aria-hidden="true" />
              출발 온도 <strong aria-label="필수">*</strong>
            </span>
            <div className="input-with-unit">
              <input
                inputMode="numeric"
                type="number"
                min="-50"
                max="60"
                step="1"
                value={tempOut}
                onChange={(event) => {
                  setTempOut(event.target.value)
                  markManualEdit()
                }}
                required
              />
              <span>°C</span>
            </div>
          </label>
          <label className="field">
            <span>
              <Thermometer size={17} aria-hidden="true" />
              귀가 온도
            </span>
            <div className="input-with-unit">
              <input
                inputMode="numeric"
                type="number"
                min="-50"
                max="60"
                step="1"
                placeholder="출발과 같음"
                value={tempBack}
                onChange={(event) => {
                  setTempBack(event.target.value)
                  markManualEdit()
                }}
              />
              <span>°C</span>
            </div>
          </label>
        </div>

        <fieldset className="field">
          <legend>
            <CloudRain size={17} aria-hidden="true" />
            비
          </legend>
          <div className="segmented segmented--two">
            {homeConditionValues.map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="rain"
                  value={value}
                  checked={rainCondition === value}
                  onChange={() => {
                    setRainCondition(value)
                    markManualEdit()
                  }}
                />
                <span>{conditionLabels[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>
            <Footprints size={17} aria-hidden="true" />
            오래 걷기
          </legend>
          <div className="segmented segmented--two">
            {homeConditionValues.map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="walking"
                  value={value}
                  checked={longWalkCondition === value}
                  onChange={() => setLongWalkCondition(value)}
                />
                <span>{conditionLabels[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field-grid field-grid--two">
          <label className="field">
            <span>장소</span>
            <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
              <option value="">미지정</option>
              {data?.places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>교통수단</span>
            <select
              value={transportModeId}
              onChange={(event) => setTransportModeId(event.target.value)}
            >
              <option value="">미지정</option>
              {data?.transportModes.map((transport) => (
                <option key={transport.id} value={transport.id}>
                  {transport.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {validationError && (
          <p className="form-error" role="alert">
            {validationError}
          </p>
        )}
        <button className="button button--primary button--wide" type="submit">
          <Search size={19} aria-hidden="true" />
          착장 찾기
        </button>
      </form>

      {loading && <LoadingState label="옷장 데이터를 불러오는 중" />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      {data && submitted && (
        <>
          {recentPurchases.length > 0 && (
            <section className="section recent-purchase-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">RECENT PURCHASES</p>
                  <h2>최근 구매 착장</h2>
                </div>
                <span className="count">{recentPurchases.length}개 후보</span>
              </div>

              <div className="recommendation-intro">
                <strong>
                  오늘 온도에 맞는 후보 중 최근 구매 아이템을 먼저 골랐어요.
                </strong>
                <p>
                  직접 착용 또는 비슷한 과거 착장의 OK 온도 범위와 맞는
                  Outfit만 구매일 최신순으로 보여줍니다.
                </p>
              </div>

              <div className="card-list">
                {recentPurchases.map((recommendation) => (
                  <OutfitCard
                    key={recommendation.outfit.id}
                    outfit={recommendation.outfit}
                    data={data}
                    recommendation={recommendation}
                    purchaseHighlight
                    layout="home"
                    state={{
                      recommendation,
                      input: submitted,
                      weather: submittedWeather ?? undefined,
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">RECOMMENDATION</p>
                <h2>추천 착장</h2>
              </div>
              <span className="count">{recommendations.length}개 후보</span>
            </div>

            {recommendations.length === 0 ? (
              <EmptyState
                title="기록 기반 추천이 없어요"
                description="현재 조건에서 추천할 수 있는 착용 기록이 없습니다."
                action={
                  <Link className="button button--secondary" to="/lookbook">
                    전체 Lookbook 보기
                  </Link>
                }
              />
            ) : (
              <div className="card-list">
                {recommendations
                  .slice(0, showAll ? recommendations.length : 3)
                  .map((recommendation) => (
                    <OutfitCard
                      key={recommendation.outfit.id}
                      outfit={recommendation.outfit}
                      data={data}
                      recommendation={recommendation}
                      layout="home"
                      state={{
                        recommendation,
                        input: submitted,
                        weather: submittedWeather ?? undefined,
                      }}
                    />
                  ))}
                {!showAll && recommendations.length > 3 && (
                  <button
                    className="button button--secondary button--wide"
                    type="button"
                    onClick={() => setShowAll(true)}
                  >
                    나머지 {recommendations.length - 3}개 더 보기
                  </button>
                )}
              </div>
            )}
          </section>

          {trialRecommendations.length > 0 && (
            <section className="section trial-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TRY A NEW LOOK</p>
                  <h2>새 착장 시험해보기</h2>
                </div>
                <span className="count">
                  {trialRecommendations.length}개 미착용
                </span>
              </div>

              <div className="trial-intro">
                <strong>
                  아직 직접 입지는 않았지만 오늘 온도와 비슷한 근거가 있어요.
                </strong>
                <p>
                  비슷한 과거 착장의 OK 온도 범위와 오늘 온도가 맞는
                  착장입니다. 실제로 입고 기록하면 다음 추천부터 직접 근거
                  후보로 이동합니다.
                </p>
              </div>

              <div className="card-list">
                {trialRecommendations
                  .slice(0, showAllTrials ? trialRecommendations.length : 3)
                  .map((recommendation) => (
                    <OutfitCard
                      key={recommendation.outfit.id}
                      outfit={recommendation.outfit}
                      data={data}
                      recommendation={recommendation}
                      layout="home"
                      state={{
                        recommendation,
                        input: submitted,
                        weather: submittedWeather ?? undefined,
                      }}
                    />
                  ))}
                {!showAllTrials && trialRecommendations.length > 3 && (
                  <button
                    className="button button--secondary button--wide"
                    type="button"
                    onClick={() => setShowAllTrials(true)}
                  >
                    나머지 {trialRecommendations.length - 3}개 더 보기
                  </button>
                )}
              </div>
            </section>
          )}

          {unknownTrialRecommendations.length > 0 && (
            <section className="section trial-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TEMPERATURE UNKNOWN</p>
                  <h2>적정 온도 미확인 착장</h2>
                </div>
                <span className="count">
                  {unknownTrialRecommendations.length}개 미확인
                </span>
              </div>

              <div className="trial-intro">
                <strong>오늘 온도와 대조할 OK 기록이 아직 없어요.</strong>
                <p>
                  비슷한 과거 착장을 찾지 못했거나 적정 온도 기록이 없는
                  계획입니다. 오늘 추천이 아니라 참고용 시험 후보입니다.
                </p>
              </div>

              <div className="card-list">
                {unknownTrialRecommendations
                  .slice(
                    0,
                    showAllUnknownTrials
                      ? unknownTrialRecommendations.length
                      : 3,
                  )
                  .map((recommendation) => (
                    <OutfitCard
                      key={recommendation.outfit.id}
                      outfit={recommendation.outfit}
                      data={data}
                      recommendation={recommendation}
                      layout="home"
                      state={{
                        recommendation,
                        input: submitted,
                        weather: submittedWeather ?? undefined,
                      }}
                    />
                  ))}
                {!showAllUnknownTrials &&
                  unknownTrialRecommendations.length > 3 && (
                    <button
                      className="button button--secondary button--wide"
                      type="button"
                      onClick={() => setShowAllUnknownTrials(true)}
                    >
                      나머지 {unknownTrialRecommendations.length - 3}개 더 보기
                    </button>
                  )}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  )
}
