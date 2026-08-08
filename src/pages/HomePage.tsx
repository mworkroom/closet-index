import {
  CalendarDays,
  CloudRain,
  CloudSun,
  Footprints,
  RefreshCw,
  Search,
  Thermometer,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { OutfitCard } from '../components/OutfitCard'
import { useClosetData } from '../context/DataContext'
import { useSeasonScope } from '../context/SeasonScopeContext'
import {
  formatForecastTime,
  homeConditionValues,
  hourOptions,
  humidityLabel,
  kstDate,
  RECOMMENDATION_PAGE_SIZE,
  temperatureLabel,
  useHomeRecommendation,
} from '../features/home/useHomeRecommendation'
import { RecentPurchaseSection } from '../features/home/RecentPurchaseSection'
import { sortPlacesForSelection } from '../lib/place-options'
import { conditionLabels } from '../lib/types'

export function HomePage() {
  const {
    data,
    loading,
    error,
    refresh,
    fetchWeatherForecast,
  } = useClosetData()
  const { activeSeasons } = useSeasonScope()
  const {
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
    normalContextEvidenceByOutfitId,
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
  } = useHomeRecommendation({
    data,
    activeSeasons,
    fetchWeatherForecast,
  })

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
          <div className="weather-panel__location-badge">
            {defaultWeatherLocation && (
              <strong>{defaultWeatherLocation.label}</strong>
            )}
            <CloudSun size={24} aria-hidden="true" />
          </div>
        </div>

        {defaultWeatherLocation ? (
          <>
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
                    clearWeatherFeedback()
                  }}
                />
              </label>
              <label className="field">
                <span>출발</span>
                <select
                  value={departureTime}
                  onChange={(event) => {
                    setDepartureTime(event.target.value)
                    clearWeatherFeedback()
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
                <span>
                  {returnTime < departureTime ? '귀가 (다음 날)' : '귀가'}
                </span>
                <select
                  value={returnTime}
                  onChange={(event) => {
                    setReturnTime(event.target.value)
                    clearWeatherFeedback()
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
              className="button button--primary button--wide"
              type="button"
              onClick={() => void loadWeather()}
              disabled={weatherLoading}
            >
              {weatherLoading ? (
                <>
                  <span className="spinner spinner--small" aria-hidden="true" />
                  날씨 불러오는 중
                </>
              ) : (
                <>
                  <RefreshCw size={18} aria-hidden="true" />
                  날씨로 추천 보기
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
              {sortPlacesForSelection(data?.places ?? []).map((place) => (
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
          <RecentPurchaseSection
            data={data}
            input={submitted}
            weather={submittedWeather ?? undefined}
            recommendations={recentPurchases}
          />

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
                  .slice(0, visibleRecommendationCount)
                  .map((recommendation) => (
                    <OutfitCard
                      key={recommendation.outfit.id}
                      outfit={recommendation.outfit}
                      data={data}
                      recommendation={recommendation}
                      normalContextEvidence={normalContextEvidenceByOutfitId.get(
                        recommendation.outfit.id,
                      )}
                      layout="home"
                      state={{
                        recommendation,
                        input: submitted,
                        weather: submittedWeather ?? undefined,
                      }}
                    />
                  ))}
                {recommendations.length > visibleRecommendationCount && (
                  <button
                    className="button button--secondary button--wide"
                    type="button"
                    onClick={() =>
                      setVisibleRecommendationCount((current) =>
                        Math.min(
                          current + RECOMMENDATION_PAGE_SIZE,
                          recommendations.length,
                        ),
                      )
                    }
                  >
                    {Math.min(
                      RECOMMENDATION_PAGE_SIZE,
                      recommendations.length - visibleRecommendationCount,
                    )}개 더 보기
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
                  오늘 온도와 비슷한 근거가 있어요.
                </strong>
                <p>
                  핵심 Item별 OK 온도를 모은 공통 구간이나 비슷한 과거
                  Outfit의 범위에 해당하는 착장입니다.
                </p>
              </div>

              <div className="card-list">
                {trialRecommendations
                  .slice(0, visibleTrialCount)
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
                {trialRecommendations.length > visibleTrialCount && (
                  <button
                    className="button button--secondary button--wide"
                    type="button"
                    onClick={() =>
                      setVisibleTrialCount((current) =>
                        Math.min(
                          current + RECOMMENDATION_PAGE_SIZE,
                          trialRecommendations.length,
                        ),
                      )
                    }
                  >
                    {Math.min(
                      RECOMMENDATION_PAGE_SIZE,
                      trialRecommendations.length - visibleTrialCount,
                    )}개 더 보기
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
