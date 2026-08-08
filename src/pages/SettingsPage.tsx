import { LogOut, MapPin, Save } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { useClosetData } from '../context/DataContext'
import { useSeasonScope } from '../context/SeasonScopeContext'
import {
  formatSeasonScope,
  SEASONS,
  seasonLabels,
} from '../lib/seasons'
import packageMetadata from '../../package.json'

interface LocationFormState {
  label: string
  officialName: string
  adminCode: string
  nx: string
  ny: string
}

const emptyLocationForm: LocationFormState = {
  label: '',
  officialName: '',
  adminCode: '',
  nx: '',
  ny: '',
}

export function SettingsPage() {
  const { mode, user, logout } = useAuth()
  const { data, saveDefaultWeatherLocation } = useClosetData()
  const {
    activeSeasons,
    showAllSeasons,
    toggleSeason,
  } = useSeasonScope()
  const defaultWeatherLocation = useMemo(
    () => data?.weatherLocations?.find((location) => location.isDefault) ?? null,
    [data?.weatherLocations],
  )
  const [editingLocation, setEditingLocation] = useState(false)
  const [locationForm, setLocationForm] =
    useState<LocationFormState>(emptyLocationForm)
  const [savingLocation, setSavingLocation] = useState(false)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const appVersion = packageMetadata.version
  const dataVersion =
    import.meta.env.VITE_DATA_VERSION ?? (mode === 'demo' ? 'demo-v1' : 'not-set')

  useEffect(() => {
    if (!defaultWeatherLocation) {
      setLocationForm(emptyLocationForm)
      return
    }

    setLocationForm({
      label: defaultWeatherLocation.label,
      officialName: defaultWeatherLocation.officialName ?? '',
      adminCode: defaultWeatherLocation.adminCode ?? '',
      nx: String(defaultWeatherLocation.nx),
      ny: String(defaultWeatherLocation.ny),
    })
  }, [defaultWeatherLocation])

  const updateLocationField = (
    field: keyof LocationFormState,
    value: string,
  ) => {
    setLocationMessage(null)
    setLocationForm((current) => ({ ...current, [field]: value }))
  }

  const saveLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nx = Number(locationForm.nx)
    const ny = Number(locationForm.ny)
    const label = locationForm.label.trim()
    const adminCode = locationForm.adminCode.trim()

    if (!label || !Number.isInteger(nx) || nx <= 0 || !Number.isInteger(ny) || ny <= 0) {
      setLocationMessage('위치 이름과 양의 정수 격자 좌표를 확인해 주세요.')
      return
    }
    if (adminCode && !/^\d{10}$/.test(adminCode)) {
      setLocationMessage('행정동 코드는 숫자 10자리로 입력해 주세요.')
      return
    }

    setSavingLocation(true)
    setLocationMessage(null)
    try {
      await saveDefaultWeatherLocation({
        id: defaultWeatherLocation?.id,
        label,
        officialName: locationForm.officialName.trim() || null,
        adminCode: adminCode || null,
        nx,
        ny,
      })
      setEditingLocation(false)
      setLocationMessage('기본 날씨 위치를 저장했습니다.')
    } catch {
      setLocationMessage('기본 날씨 위치를 저장하지 못했습니다.')
    } finally {
      setSavingLocation(false)
    }
  }

  return (
    <AppShell title="Settings" eyebrow="ACCOUNT & DATA" back>
      <section className="section season-settings" aria-labelledby="season-settings-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT WARDROBE</p>
            <h2 id="season-settings-title">현재 옷장 범위</h2>
          </div>
        </div>
        <p className="muted season-settings__description">
          Closet과 Lookbook에서 둘러볼 계절을 선택해 주세요. 여러 계절을
          함께 선택할 수 있고, HOME 추천은 온도를 우선합니다.
        </p>
        <div className="season-settings__options">
          <button
            className="season-option"
            type="button"
            aria-pressed={activeSeasons.length === 0}
            onClick={showAllSeasons}
          >
            전체
          </button>
          {SEASONS.map((season) => (
            <button
              className="season-option"
              type="button"
              aria-pressed={activeSeasons.includes(season)}
              onClick={() => toggleSeason(season)}
              key={season}
            >
              {seasonLabels[season]}
            </button>
          ))}
        </div>
        <p className="season-settings__status" role="status">
          현재 적용: <strong>{formatSeasonScope(activeSeasons)}</strong>
        </p>
      </section>

      <section
        className="section weather-settings"
        aria-labelledby="weather-settings-title"
      >
        <div className="section-heading weather-settings__heading">
          <div>
            <p className="eyebrow">WEATHER LOCATION</p>
            <h2 id="weather-settings-title">기본 날씨 위치</h2>
          </div>
          <MapPin size={22} aria-hidden="true" />
        </div>

        {!editingLocation ? (
          <div className="weather-settings__summary">
            {defaultWeatherLocation ? (
              <>
                <strong>{defaultWeatherLocation.label}</strong>
                {defaultWeatherLocation.officialName ? (
                  <span>{defaultWeatherLocation.officialName}</span>
                ) : null}
                <span>
                  기상청 격자 {defaultWeatherLocation.nx}, {defaultWeatherLocation.ny}
                </span>
              </>
            ) : (
              <p className="muted">
                저장된 기본 위치가 없습니다. HOME은 수동 온도 입력을 유지합니다.
              </p>
            )}
            <button
              className="button button--secondary button--wide"
              type="button"
              onClick={() => {
                setLocationMessage(null)
                setEditingLocation(true)
              }}
            >
              {defaultWeatherLocation ? '위치 변경' : '위치 설정'}
            </button>
          </div>
        ) : (
          <form className="weather-location-form" onSubmit={saveLocation}>
            <label className="field">
              <span>표시 이름</span>
              <input
                value={locationForm.label}
                onChange={(event) => updateLocationField('label', event.target.value)}
                placeholder="예: 창4동"
                autoComplete="off"
                required
              />
            </label>
            <label className="field">
              <span>공식 행정동</span>
              <input
                value={locationForm.officialName}
                onChange={(event) =>
                  updateLocationField('officialName', event.target.value)
                }
                placeholder="예: 서울특별시 도봉구 창제4동"
                autoComplete="off"
              />
            </label>
            <div className="field-grid field-grid--two">
              <label className="field">
                <span>기상청 격자 nx</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={locationForm.nx}
                  onChange={(event) => updateLocationField('nx', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>기상청 격자 ny</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={locationForm.ny}
                  onChange={(event) => updateLocationField('ny', event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="field">
              <span>행정동 코드</span>
              <input
                value={locationForm.adminCode}
                onChange={(event) =>
                  updateLocationField('adminCode', event.target.value)
                }
                placeholder="숫자 10자리"
                inputMode="numeric"
                pattern="[0-9]{10}"
                autoComplete="off"
              />
            </label>
            <div className="weather-location-form__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setEditingLocation(false)}
                disabled={savingLocation}
              >
                취소
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={savingLocation}
              >
                <Save size={17} aria-hidden="true" />
                {savingLocation ? '저장 중' : '저장'}
              </button>
            </div>
          </form>
        )}
        {locationMessage ? (
          <p className="weather-settings__message" role="status">
            {locationMessage}
          </p>
        ) : null}
      </section>

      <section className="settings-card">
        <div>
          <span>로그인 계정</span>
          <strong>{mode === 'demo' ? '로컬 데모 모드' : user?.email ?? '확인 불가'}</strong>
        </div>
        <div>
          <span>앱 버전</span>
          <strong>{appVersion} · Phase 5 W2</strong>
        </div>
        <div>
          <span>데이터 버전</span>
          <strong>{dataVersion} · phase-2-weather-v1</strong>
        </div>
        <div>
          <span>현재 데이터 원본</span>
          <strong>
            {mode === 'demo'
              ? '브라우저 데모 데이터'
              : 'Supabase · 전환 전 시험 데이터'}
          </strong>
        </div>
      </section>

      <p className="scope-note">
        정식 전환 전까지 실제 기록의 원본은 Notion입니다. 데모 데이터와
        Technical Alpha의 Supabase 기록은 검증용입니다.
      </p>

      {mode === 'supabase' ? (
        <button
          className="button button--secondary button--wide"
          type="button"
          onClick={() => void logout()}
        >
          <LogOut size={18} aria-hidden="true" />
          로그아웃
        </button>
      ) : (
        <p className="muted center-text">데모 모드에는 로그인 세션이 없습니다.</p>
      )}
    </AppShell>
  )
}
