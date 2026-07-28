import { Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { todayInKorea } from '../lib/date'
import type { RecommendationNavigationState } from '../lib/navigation'
import { outfitLabel } from '../lib/outfits'
import type {
  ConditionChoice,
  ThermalFeeling,
  WearLogInput,
} from '../lib/types'
import { conditionLabels, feelingLabels } from '../lib/types'

function optionalInteger(value: string) {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= -50 && number <= 60
    ? number
    : NaN
}

function formatIssuedAt(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function WearLogPage() {
  const { outfitId: routeOutfitId, logId } = useParams()
  const editing = Boolean(logId)
  const location = useLocation()
  const navigate = useNavigate()
  const { data, loading, error, createWearLog, updateWearLog } = useClosetData()
  const existing = data?.wearLogs.find((log) => log.id === logId)
  const outfitId = existing?.outfitId ?? routeOutfitId ?? ''
  const outfit = data?.outfits.find((entry) => entry.id === outfitId)
  const initializationKey = existing ? `edit:${existing.id}` : `new:${outfitId}`
  const navigationState = (location.state ?? {}) as RecommendationNavigationState
  const [initializedKey, setInitializedKey] = useState<string | null>(null)
  const [wornOn, setWornOn] = useState(todayInKorea())
  const [tempOut, setTempOut] = useState('')
  const [tempBack, setTempBack] = useState('')
  const [feelingOut, setFeelingOut] = useState<ThermalFeeling>(null)
  const [feelingBack, setFeelingBack] = useState<ThermalFeeling>(null)
  const [rainCondition, setRainCondition] =
    useState<ConditionChoice>('unknown')
  const [longWalkCondition, setLongWalkCondition] =
    useState<ConditionChoice>('unknown')
  const [placeId, setPlaceId] = useState('')
  const [transportModeId, setTransportModeId] = useState('')
  const [memo, setMemo] = useState('')
  const [submissionToken] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const temperatureSource =
    existing?.temperatureSource ??
    (navigationState.weather ? 'weather' : 'manual')
  const weatherLocationId =
    existing?.weatherLocationId ?? navigationState.weather?.locationId ?? null
  const weatherIssuedAt =
    existing?.weatherIssuedAt ?? navigationState.weather?.issuedAt ?? null
  const weatherBaseline = existing?.temperatureSource === 'weather'
    ? {
        tempOut: existing.tempOut,
        tempBack: existing.tempBack,
        rainCondition: existing.rainCondition,
      }
    : navigationState.weather ?? null
  const weatherValuesChanged = Boolean(
    initializedKey === initializationKey &&
      weatherBaseline &&
      (tempOut !==
        (weatherBaseline.tempOut === null
          ? ''
          : String(weatherBaseline.tempOut)) ||
        tempBack !==
          (weatherBaseline.tempBack === null
            ? ''
            : String(weatherBaseline.tempBack)) ||
        rainCondition !== weatherBaseline.rainCondition),
  )
  const weatherOverridden =
    temperatureSource === 'weather' &&
    (existing?.weatherOverridden === true ||
      navigationState.weather?.overridden === true ||
      weatherValuesChanged)
  const sourceLabel =
    temperatureSource === 'weather'
      ? weatherOverridden
        ? '기상청 예보에서 직접 수정'
        : '기상청 예보'
      : temperatureSource === 'notion'
        ? '기존 Notion 기록'
        : '직접 입력'
  const weatherLocationLabel =
    data?.weatherLocations?.find((entry) => entry.id === weatherLocationId)
      ?.label ?? null

  useEffect(() => {
    if (!data) return
    if (!outfit || initializedKey === initializationKey) return

    if (existing) {
      setWornOn(existing.wornOn)
      setTempOut(existing.tempOut === null ? '' : String(existing.tempOut))
      setTempBack(existing.tempBack === null ? '' : String(existing.tempBack))
      setFeelingOut(existing.feelingOut)
      setFeelingBack(existing.feelingBack)
      setRainCondition(existing.rainCondition)
      setLongWalkCondition(existing.longWalkCondition)
      setPlaceId(existing.placeId ?? '')
      setTransportModeId(existing.transportModeId ?? '')
      setMemo(existing.memo ?? '')
    } else if (navigationState.input) {
      setTempOut(String(navigationState.input.tempOut))
      setTempBack(
        navigationState.input.tempBack === null
          ? ''
          : String(navigationState.input.tempBack),
      )
      setRainCondition(navigationState.input.rainCondition)
      setLongWalkCondition(navigationState.input.longWalkCondition)
      setPlaceId(navigationState.input.placeId ?? '')
      setTransportModeId(navigationState.input.transportModeId ?? '')
    }
    setInitializedKey(initializationKey)
  }, [
    data,
    existing,
    initializationKey,
    initializedKey,
    navigationState.input,
    outfit,
  ])

  const title = useMemo(
    () => (outfit && data ? outfitLabel(outfit, data.items) : '착용 기록'),
    [data, outfit],
  )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsedOut = optionalInteger(tempOut)
    const parsedBack = optionalInteger(tempBack)
    if (parsedOut === null || Number.isNaN(parsedOut)) {
      setValidationError('출발 온도는 -50~60 사이의 정수로 입력해 주세요.')
      return
    }
    if (Number.isNaN(parsedBack)) {
      setValidationError('귀가 온도는 비워 두거나 -50~60 사이의 정수로 입력해 주세요.')
      return
    }
    if (!outfit) {
      setValidationError('연결할 Outfit을 찾을 수 없습니다.')
      return
    }

    const input: WearLogInput = {
      outfitId: outfit.id,
      wornOn,
      tempOut: parsedOut,
      tempBack: parsedBack,
      tempBackInferred: parsedBack === null,
      feelingOut,
      feelingBack,
      rainCondition,
      longWalkCondition,
      placeId: placeId || null,
      transportModeId: transportModeId || null,
      memo: memo.trim() || null,
      temperatureSource:
        temperatureSource === 'weather' ? 'weather' : 'manual',
      weatherLocationId:
        temperatureSource === 'weather' ? weatherLocationId : null,
      weatherIssuedAt:
        temperatureSource === 'weather' ? weatherIssuedAt : null,
      weatherOverridden:
        temperatureSource === 'weather' ? weatherOverridden : false,
      submissionToken: existing?.submissionToken ?? submissionToken,
    }

    setValidationError(null)
    setSaving(true)
    try {
      if (existing) {
        await updateWearLog(existing.id, input)
      } else {
        await createWearLog(input)
      }
      navigate(`/calendar?date=${wornOn}`, { replace: true })
    } catch {
      // DataContext owns the user-facing error state.
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell
      title={editing ? '착용 기록 수정' : '오늘 입기'}
      eyebrow={title}
      back
      hideNavigation
    >
      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && !outfit && (
        <ErrorState message="연결된 Outfit 또는 착용 기록을 찾을 수 없습니다." />
      )}
      {outfit && (
        <form className="panel wear-form" onSubmit={submit}>
          <div
            className={`wear-form__source wear-form__source--${temperatureSource}`}
            aria-live="polite"
          >
            <span>입력 출처</span>
            <strong>{sourceLabel}</strong>
            {temperatureSource === 'weather' && (
              <small>
                {[weatherLocationLabel, formatIssuedAt(weatherIssuedAt) && `${formatIssuedAt(weatherIssuedAt)} 발표`]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            )}
          </div>
          <label className="field">
            <span>날짜 <strong aria-label="필수">*</strong></span>
            <input
              type="date"
              value={wornOn}
              onChange={(event) => setWornOn(event.target.value)}
              required
            />
          </label>
          <div className="field-grid field-grid--two">
            <label className="field">
              <span>출발 온도 <strong aria-label="필수">*</strong></span>
              <div className="input-with-unit">
                <input
                  type="number"
                  inputMode="numeric"
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
              <span>귀가 온도</span>
              <div className="input-with-unit">
                <input
                  type="number"
                  inputMode="numeric"
                  min="-50"
                  max="60"
                  step="1"
                  value={tempBack}
                  placeholder="출발과 같음"
                  onChange={(event) => setTempBack(event.target.value)}
                />
                <span>°C</span>
              </div>
            </label>
          </div>
          <p className="field-help">
            귀가 온도를 비우면 추천 계산에서는 출발 온도와 같은 값으로 봅니다.
          </p>

          <div className="field-grid field-grid--two">
            <label className="field">
              <span>출발 체감</span>
              <select
                value={feelingOut ?? ''}
                onChange={(event) =>
                  setFeelingOut((event.target.value || null) as ThermalFeeling)
                }
              >
                <option value="">미기록</option>
                {(['cold', 'ok', 'hot'] as const).map((value) => (
                  <option value={value} key={value}>
                    {feelingLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>귀가 체감</span>
              <select
                value={feelingBack ?? ''}
                onChange={(event) =>
                  setFeelingBack((event.target.value || null) as ThermalFeeling)
                }
              >
                <option value="">미기록</option>
                {(['cold', 'ok', 'hot'] as const).map((value) => (
                  <option value={value} key={value}>
                    {feelingLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-grid field-grid--two">
            <label className="field">
              <span>비</span>
              <select
                value={rainCondition}
                onChange={(event) =>
                  setRainCondition(event.target.value as ConditionChoice)
                }
              >
                {(Object.keys(conditionLabels) as ConditionChoice[]).map((value) => (
                  <option value={value} key={value}>
                    {conditionLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>오래 걷기</span>
              <select
                value={longWalkCondition}
                onChange={(event) =>
                  setLongWalkCondition(event.target.value as ConditionChoice)
                }
              >
                {(Object.keys(conditionLabels) as ConditionChoice[]).map((value) => (
                  <option value={value} key={value}>
                    {conditionLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-grid field-grid--two">
            <label className="field">
              <span>장소</span>
              <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
                <option value="">미지정</option>
                {data?.places.map((place) => (
                  <option value={place.id} key={place.id}>
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
                {data?.transportModes.map((mode) => (
                  <option value={mode.id} key={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>메모</span>
            <textarea
              rows={3}
              value={memo}
              placeholder="필요한 경우에만 기록"
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>

          {validationError && (
            <p className="form-error" role="alert">
              {validationError}
            </p>
          )}
          <button
            className="button button--primary button--wide"
            type="submit"
            disabled={saving}
          >
            <Save size={18} aria-hidden="true" />
            {saving ? '저장 중…' : editing ? '수정 저장' : '착용 기록 저장'}
          </button>
        </form>
      )}
    </AppShell>
  )
}
