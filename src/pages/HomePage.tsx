import { CloudRain, Footprints, Search, Thermometer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { OutfitCard } from '../components/OutfitCard'
import { useClosetData } from '../context/DataContext'
import {
  partitionRecommendations,
  recommendOutfits,
} from '../lib/recommendation'
import type { ConditionChoice, RecommendationInput } from '../lib/types'
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

function parseTemperature(value: string) {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= -50 && number <= 60 ? number : NaN
}

export function HomePage() {
  const { data, loading, error, refresh } = useClosetData()
  const [tempOut, setTempOut] = useState(String(defaultInput.tempOut))
  const [tempBack, setTempBack] = useState('')
  const [rainCondition, setRainCondition] =
    useState<HomeConditionChoice>('no')
  const [longWalkCondition, setLongWalkCondition] =
    useState<HomeConditionChoice>('no')
  const [placeId, setPlaceId] = useState('')
  const [transportModeId, setTransportModeId] = useState('')
  const [submitted, setSubmitted] = useState<RecommendationInput | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showAllTrials, setShowAllTrials] = useState(false)
  const [showAllUnknownTrials, setShowAllUnknownTrials] = useState(false)

  const {
    recentPurchases,
    recommendations,
    trialRecommendations,
    unknownTrialRecommendations,
  } = useMemo(() => {
    const results = data && submitted ? recommendOutfits(data, submitted) : []
    return partitionRecommendations(results)
  }, [data, submitted])

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
    setShowAll(false)
    setShowAllTrials(false)
    setShowAllUnknownTrials(false)
    setSubmitted({
      tempOut: parsedOut,
      tempBack: parsedBack,
      rainCondition,
      longWalkCondition,
      placeId: placeId || null,
      transportModeId: transportModeId || null,
    })
  }

  return (
    <AppShell title="오늘 뭐 입지?" eyebrow="CLOSET INDEX">
      <section className="hero-copy">
        <p>오늘의 조건과 실제 착용 기록을 비교해 이미 검증한 착장을 찾습니다.</p>
      </section>

      <form className="panel condition-form" onSubmit={submit}>
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
                onChange={(event) => setTempOut(event.target.value)}
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
                onChange={(event) => setTempBack(event.target.value)}
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
                  onChange={() => setRainCondition(value)}
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
                    state={{ recommendation, input: submitted }}
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
                      state={{ recommendation, input: submitted }}
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
                      state={{ recommendation, input: submitted }}
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
                      state={{ recommendation, input: submitted }}
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
