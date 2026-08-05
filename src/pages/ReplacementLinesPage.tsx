import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  buildReplacementLineOverview,
  type ReplacementLineColorGroup,
  type ReplacementLineOverviewRow,
} from '../features/replacement-lines/replacement-line-overview'
import { getReplacementLineSurvivalStatus } from '../features/replacement-lines/replacement-line-survival'
import { todayInKorea } from '../lib/date'
import type {
  ReplacementLineColorCategory,
  ReplacementLineSnapshot,
} from '../lib/types'
import { REPLACEMENT_LINE_COLOR_CATEGORIES } from '../lib/types'

function usesLightText(hex: string) {
  const value = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) return false
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return (red * 299 + green * 587 + blue * 114) / 1000 < 142
}

function ReplacementLineCard({
  line,
  today,
}: {
  line: ReplacementLineOverviewRow
  today: string
}) {
  const isEmpty = line.membershipCount === 0
  const survivalStatus = getReplacementLineSurvivalStatus(line, today)
  return (
    <Link
      className="replacement-line-card replacement-line-card--link"
      to={`/replacement-lines/${line.id}`}
      aria-label={
        survivalStatus
          ? `${line.name} 계보 보기. ${survivalStatus.accessibleLabel}`
          : `${line.name} 계보 보기`
      }
    >
      <span className="replacement-line-card__heading">
        <strong>{line.name}</strong>
        <span>
          Active {line.activeItems.length} · Retired {line.retiredItems.length}
        </span>
      </span>
      <span className="replacement-line-card__count">
        {line.membershipCount} Item
      </span>
      <ChevronRight aria-hidden="true" size={18} />

      {survivalStatus ? (
        <span
          className={`replacement-line-survival replacement-line-survival--${survivalStatus.kind}`}
          aria-label={survivalStatus.accessibleLabel}
        >
          {survivalStatus.label}
        </span>
      ) : null}

      {isEmpty ||
      line.hasMultipleLineItem ||
      line.hasMultipleSemanticColors ||
      line.reviewStatus === 'needs_review' ? (
        <span className="replacement-line-warnings" aria-label="Line 점검 상태">
          {line.reviewStatus === 'needs_review' ? <span>재검토 필요</span> : null}
          {isEmpty ? <span>빈 Line</span> : null}
          {line.hasMultipleLineItem ? <span>복수 Line 소속</span> : null}
          {line.hasMultipleSemanticColors ? <span>색상 확인 필요</span> : null}
        </span>
      ) : null}
    </Link>
  )
}

function ColorIndexCard({ group }: { group: ReplacementLineColorGroup }) {
  const lightText = usesLightText(group.displayHex)
  return (
    <Link
      className={`replacement-line-color-card${lightText ? ' replacement-line-color-card--dark' : ''}`}
      to={`/replacement-lines?color=${encodeURIComponent(group.id)}`}
      style={{ backgroundColor: group.displayHex }}
      aria-label={`${group.label}, ${group.lines.length}개 Line 보기`}
    >
      <strong>{group.label}</strong>
      <span>{group.lines.length} Lines</span>
    </Link>
  )
}

function ArchivedLineCard({
  line,
  representativeName,
}: {
  line: ReplacementLineOverviewRow
  representativeName: string | null
}) {
  return (
    <Link
      className="replacement-line-archived-card"
      to={`/replacement-lines/${line.id}`}
      aria-label={`${line.name} 보관된 Line 보기`}
    >
      <span>
        <strong>{line.name}</strong>
        <small>
          {representativeName
            ? `대표 Line · ${representativeName}`
            : `${line.membershipCount} Item · 독립 보관`}
        </small>
      </span>
      <ChevronRight aria-hidden="true" size={18} />
    </Link>
  )
}

export function ReplacementLinesPage() {
  const { data, replacementLines } = useClosetData()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [snapshot, setSnapshot] = useState<ReplacementLineSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [newLineName, setNewLineName] = useState('')
  const [newLineStyleIdentity, setNewLineStyleIdentity] = useState('')
  const [newLineColorCategory, setNewLineColorCategory] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const today = todayInKorea()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await replacementLines.load())
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Line을 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [replacementLines.load])

  useEffect(() => {
    void load()
  }, [load])

  const overview = useMemo(
    () =>
      snapshot && data
        ? buildReplacementLineOverview(snapshot, data.items)
        : null,
    [data, snapshot],
  )
  const selectedColorId = searchParams.get('color')
  const selectedColor = selectedColorId
    ? overview?.colorGroups.find((group) => group.id === selectedColorId) ?? null
    : null
  const selectedColorStyleGroups = useMemo(() => {
    if (!overview || !selectedColor) return []

    const selectedLineIds = new Set(selectedColor.lines.map((line) => line.id))
    return overview.groups
      .map((group) => ({
        ...group,
        lines: group.lines.filter((line) => selectedLineIds.has(line.id)),
      }))
      .filter((group) => group.lines.length > 0)
  }, [overview, selectedColor])
  const handleCreateLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = newLineName.trim()
    if (!name) {
      setCreateError('새 Line 이름을 입력해 주세요.')
      return
    }
    if (!newLineColorCategory) {
      setCreateError('대표 색상 category를 골라 주세요.')
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      const created = await replacementLines.create({
        name,
        styleIdentity: newLineStyleIdentity.trim() || null,
        colorCategory: newLineColorCategory as ReplacementLineColorCategory,
      })
      navigate(`/replacement-lines/${created.id}`)
    } catch (cause) {
      setCreateError(
        cause instanceof Error
          ? cause.message
          : '새 Replacement Line을 만들지 못했습니다.',
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppShell
      title="Replacement Lines"
      eyebrow="COLOR INDEX"
      back
      action={
        <button
          className="button button--primary replacement-line-header-action"
          type="button"
          aria-expanded={createFormOpen}
          aria-controls="replacement-line-create-form"
          onClick={() => {
            setCreateFormOpen((open) => !open)
            setCreateError(null)
          }}
        >
          {createFormOpen ? <X aria-hidden="true" size={17} /> : <Plus aria-hidden="true" size={17} />}
          {createFormOpen ? 'Close' : 'Add'}
        </button>
      }
    >
      {createFormOpen ? (
        <form
          className="replacement-line-create-form"
          id="replacement-line-create-form"
          onSubmit={(event) => void handleCreateLine(event)}
        >
          <div className="replacement-line-create-form__heading">
            <strong>빈 Line 먼저 만들기</strong>
            <span>저장 후 상세 화면에서 Item을 추가할 수 있습니다.</span>
          </div>
            <label>
              <span>Line 이름</span>
              <input
                autoFocus
                maxLength={200}
                required
                value={newLineName}
                onChange={(event) => setNewLineName(event.target.value)}
                placeholder="예: Brown Bottom Spring"
              />
            </label>
            <label>
              <span>Style Identity (선택)</span>
              <input
                maxLength={200}
                value={newLineStyleIdentity}
                onChange={(event) => setNewLineStyleIdentity(event.target.value)}
                placeholder="예: Brown Bottom"
              />
            </label>
            <label>
              <span>대표 색상 category</span>
              <select
                required
                value={newLineColorCategory}
                onChange={(event) => setNewLineColorCategory(event.target.value)}
              >
                <option value="">색상을 골라 주세요</option>
                {REPLACEMENT_LINE_COLOR_CATEGORIES.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            {createError ? (
              <p className="error-text" role="alert">
                {createError}
              </p>
            ) : null}
            <button className="button button--primary" disabled={creating} type="submit">
              {creating ? '만드는 중…' : 'Line 만들고 Item 추가하기'}
            </button>
        </form>
      ) : null}

      {loading ? <LoadingState label="Replacement Line을 불러오는 중" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {overview && selectedColor ? (
        <section className="section replacement-line-color-results" aria-labelledby="selected-color-heading">
          <Link className="replacement-line-color-back" to="/replacement-lines">
            <ArrowLeft aria-hidden="true" size={16} />
            모든 색상
          </Link>
          <div className="replacement-line-color-heading">
            <span
              className="replacement-line-color-heading__swatch"
              style={{ backgroundColor: selectedColor.displayHex }}
              aria-hidden="true"
            />
            <div>
              <h2 id="selected-color-heading">{selectedColor.label}</h2>
              <span>{selectedColor.lines.length} Lines</span>
            </div>
          </div>
          <div className="replacement-line-identity-groups">
            {selectedColorStyleGroups.map((group) => (
              <section className="replacement-line-identity-group" key={group.id}>
                <div className="replacement-line-identity-heading">
                  <span aria-hidden="true" />
                  <h3>{group.label}</h3>
                  <small>{group.lines.length} Lines</small>
                </div>
                <div className="replacement-line-list">
                  {group.lines.map((line) => (
                    <ReplacementLineCard
                      line={line}
                      today={today}
                      key={line.id}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {overview && !selectedColor ? (
        <>
          <section
            className="replacement-line-summary"
            aria-labelledby="line-summary-heading"
          >
            <div className="section-heading">
              <h2 id="line-summary-heading">Line 관리 현황</h2>
              <span className="count">
                {overview.summary.lineCount} 사용 중 · {overview.summary.archivedLineCount} 보관
              </span>
            </div>
            <div className="metric-grid metric-grid--two" aria-label="Replacement Line 요약">
              <div>
                <span>고유 Item</span>
                <strong>{overview.summary.uniqueItemCount}개</strong>
              </div>
              <div>
                <span>Active / Retired</span>
                <strong>
                  {overview.summary.activeItemCount} / {overview.summary.retiredItemCount}
                </strong>
              </div>
            </div>
          </section>

          <section className="section" aria-labelledby="color-index-heading">
            <div className="section-heading">
              <h2 id="color-index-heading">Color</h2>
              <span className="count">{overview.colorGroups.length} Colors</span>
            </div>
            <div className="replacement-line-color-grid">
              {overview.colorGroups.map((group) => (
                <ColorIndexCard group={group} key={group.id} />
              ))}
            </div>
            {overview.summary.hiddenMembershipCount > 0 ? (
              <p className="warning-text replacement-line-scope-warning" role="alert">
                현재 workspace Item으로 확인되지 않는 membership{' '}
                {overview.summary.hiddenMembershipCount}개는 색상 계산에서 제외했습니다.
              </p>
            ) : null}
          </section>

          <details className="replacement-line-management">
            <summary>
              <span>
                <strong>관리 도구</strong>
                <small>{overview.summary.archivedLineCount}개 보관</small>
              </span>
              <span>보기</span>
            </summary>
            <div className="replacement-line-management__body">
              {overview.archivedLines.length > 0 ? (
                <section
                  className="replacement-line-archived"
                  aria-labelledby="archived-line-heading"
                >
                  <div className="section-heading">
                    <h2 id="archived-line-heading">보관된 Line</h2>
                    <span className="count">{overview.archivedLines.length} Lines</span>
                  </div>
                  <p className="muted">
                    병합한 Line은 대표 Line을 따라가며, 독립 보관 Line은 상세에서 다시
                    사용할 수 있습니다.
                  </p>
                  <div className="replacement-line-archived__list">
                    {overview.archivedLines.map((line) => (
                      <ArchivedLineCard
                        line={line}
                        representativeName={
                          overview.lines.find(
                            (candidate) =>
                              candidate.id === line.representativeLineId,
                          )?.name ?? null
                        }
                        key={line.id}
                      />
                    ))}
                  </div>
                </section>
              ) : (
                <p className="muted replacement-line-management__empty">
                  보관된 Line이 없습니다.
                </p>
              )}
            </div>
          </details>
        </>
      ) : null}
    </AppShell>
  )
}
