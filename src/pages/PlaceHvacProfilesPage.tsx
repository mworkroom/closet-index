import { Building2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { todayInKorea } from '../lib/date'
import {
  HVAC_INTENSITIES,
  HVAC_MODES,
  hvacIntensityLabels,
  hvacModeLabels,
  normalizedHvacIntensity,
  placeHvacProfileSourceLabels,
} from '../lib/hvac'
import { sortPlacesForSelection } from '../lib/place-options'
import { SEASONS, seasonLabels } from '../lib/seasons'
import type {
  HvacIntensity,
  HvacMode,
  PlaceHvacProfileSource,
} from '../lib/types'

const PROFILE_SOURCES = ['manual', 'wear_log_observation'] as const

export function PlaceHvacProfilesPage() {
  const {
    data,
    loading,
    error,
    refresh,
    savePlaceHvacProfile,
  } = useClosetData()
  const specificPlaces = useMemo(
    () =>
      sortPlacesForSelection(
        data?.places.filter((place) => place.kind === 'specific_venue') ?? [],
      ),
    [data?.places],
  )
  const [placeId, setPlaceId] = useState('')
  const [season, setSeason] = useState<(typeof SEASONS)[number]>('Spring')
  const [mode, setMode] = useState<HvacMode>('off')
  const [intensity, setIntensity] = useState<HvacIntensity | null>(null)
  const [memo, setMemo] = useState('')
  const [source, setSource] = useState<PlaceHvacProfileSource>('manual')
  const [lastConfirmedOn, setLastConfirmedOn] = useState(todayInKorea())
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const selectedProfile = data?.placeHvacProfiles.find(
    (profile) => profile.placeId === placeId && profile.season === season,
  )

  useEffect(() => {
    if (!placeId && specificPlaces[0]) setPlaceId(specificPlaces[0].id)
  }, [placeId, specificPlaces])

  useEffect(() => {
    if (selectedProfile) {
      setMode(selectedProfile.expectedMode)
      setIntensity(selectedProfile.expectedIntensity)
      setMemo(selectedProfile.memo ?? '')
      setSource(selectedProfile.source)
      setLastConfirmedOn(selectedProfile.lastConfirmedOn)
    } else {
      setMode('off')
      setIntensity(null)
      setMemo('')
      setSource('manual')
      setLastConfirmedOn(todayInKorea())
    }
    setFeedback(null)
  }, [placeId, season, selectedProfile])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!placeId || saving) return

    setSaving(true)
    setFeedback(null)
    try {
      await savePlaceHvacProfile({
        placeId,
        season,
        expectedMode: mode,
        expectedIntensity: normalizedHvacIntensity(mode, intensity),
        memo: memo.trim() || null,
        source,
        lastConfirmedOn,
      })
      setFeedback(selectedProfile ? 'Place Profile을 수정했습니다.' : 'Place Profile을 저장했습니다.')
    } catch {
      // DataContext owns the user-facing error state.
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) {
    return (
      <AppShell title="Place Profile & HVAC" eyebrow="Manual profile">
        <LoadingState label="Place Profile을 불러오는 중입니다." />
      </AppShell>
    )
  }

  if (error && !data) {
    return (
      <AppShell title="Place Profile & HVAC" eyebrow="Manual profile">
        <ErrorState message={error} onRetry={() => void refresh()} />
      </AppShell>
    )
  }

  if (!data) return null

  return (
    <AppShell
      title="Place Profile & HVAC"
      eyebrow="Manual profile"
      subtitle="고유 장소의 계절별 예상 HVAC만 직접 기록합니다. 기타는 적용 대상에서 제외됩니다."
      back
    >
      {specificPlaces.length === 0 ? (
        <EmptyState
          title="기록할 고유 장소가 없습니다."
          description="generic category가 아닌 Place가 있어야 Profile을 만들 수 있습니다."
        />
      ) : (
        <div className="place-hvac-layout">
          <form className="panel place-hvac-form" onSubmit={submit}>
            <div className="place-hvac-form__heading">
              <Building2 size={20} aria-hidden="true" />
              <div>
                <h2>{selectedProfile ? 'Profile 수정' : '새 Profile'}</h2>
                <p>한 장소와 한 계절에 하나의 예상값을 저장합니다.</p>
              </div>
            </div>

            <div className="field-grid field-grid--two">
              <label className="field">
                <span>고유 장소</span>
                <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
                  {specificPlaces.map((place) => (
                    <option value={place.id} key={place.id}>{place.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>계절</span>
                <select
                  value={season}
                  onChange={(event) => setSeason(event.target.value as typeof season)}
                >
                  {SEASONS.map((value) => (
                    <option value={value} key={value}>{seasonLabels[value]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-grid field-grid--two">
              <label className="field">
                <span>예상 HVAC</span>
                <select
                  value={mode}
                  onChange={(event) => {
                    const nextMode = event.target.value as HvacMode
                    setMode(nextMode)
                    setIntensity((current) => normalizedHvacIntensity(nextMode, current))
                  }}
                >
                  {HVAC_MODES.map((value) => (
                    <option value={value} key={value}>{hvacModeLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>강도</span>
                <select
                  value={intensity ?? ''}
                  disabled={mode === 'off'}
                  onChange={(event) => setIntensity(event.target.value as HvacIntensity)}
                >
                  {mode === 'off' && <option value="">해당 없음</option>}
                  {HVAC_INTENSITIES.map((value) => (
                    <option value={value} key={value}>{hvacIntensityLabels[value]}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>메모</span>
              <textarea
                rows={3}
                value={memo}
                placeholder="예상 냉난방 환경에 관해 필요한 경우에만 기록"
                onChange={(event) => setMemo(event.target.value)}
              />
            </label>

            <div className="field-grid field-grid--two">
              <label className="field">
                <span>출처</span>
                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value as PlaceHvacProfileSource)}
                >
                  {PROFILE_SOURCES.map((value) => (
                    <option value={value} key={value}>{placeHvacProfileSourceLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>마지막 확인일</span>
                <input
                  type="date"
                  max={todayInKorea()}
                  value={lastConfirmedOn}
                  onChange={(event) => setLastConfirmedOn(event.target.value)}
                  required
                />
              </label>
            </div>

            {feedback && <p className="place-hvac-form__feedback" role="status">{feedback}</p>}
            <button className="button button--primary button--wide" type="submit" disabled={saving}>
              <Save size={18} aria-hidden="true" />
              {saving ? '저장 중…' : selectedProfile ? '수정 저장' : 'Profile 저장'}
            </button>
          </form>

          <section className="panel place-hvac-list" aria-labelledby="place-hvac-list-title">
            <div>
              <p className="eyebrow">SAVED PROFILES</p>
              <h2 id="place-hvac-list-title">저장된 예상값</h2>
            </div>
            {data.placeHvacProfiles.length === 0 ? (
              <p className="muted">아직 저장된 Place Profile이 없습니다.</p>
            ) : (
              <ul>
                {data.placeHvacProfiles.map((profile) => {
                  const place = data.places.find((entry) => entry.id === profile.placeId)
                  if (!place || place.kind !== 'specific_venue') return null
                  return (
                    <li key={`${profile.placeId}:${profile.season}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setPlaceId(profile.placeId)
                          setSeason(profile.season)
                        }}
                      >
                        <span>
                          <strong>{place.name}</strong>
                          <small>{seasonLabels[profile.season]} · 마지막 확인 {profile.lastConfirmedOn}</small>
                        </span>
                        <span className="place-hvac-list__value">
                          {hvacModeLabels[profile.expectedMode]}
                          {profile.expectedIntensity && ` · ${hvacIntensityLabels[profile.expectedIntensity]}`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  )
}
