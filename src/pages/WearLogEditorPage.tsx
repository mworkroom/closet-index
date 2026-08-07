import {
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  DEFAULT_WEAR_LOG_EDITOR_FILTERS,
  WEAR_LOG_BULK_FIELDS,
  WEAR_LOG_EDITOR_COLUMNS,
  applyWearLogPatch,
  filterAndSortWearLogRows,
  hasWearLogPatch,
  mergeWearLogPatch,
  type WearLogBulkField,
  type WearLogEditorColumn,
  type WearLogEditorFilters,
  type WearLogEditorRow,
} from '../features/wear-log-editor'
import { outfitLabel } from '../lib/outfits'
import {
  conditionLabels,
  feelingLabels,
  type ConditionChoice,
  type ThermalFeeling,
  type WearLog,
  type WearLogEditableField,
  type WearLogInput,
  type WearLogPatch,
} from '../lib/types'

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const BULK_NULL_VALUE = '__wear_log_editor_null__'

type EditorOption = { value: string; label: string }

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : '저장하지 못한 기록이 있습니다.'
}

function rowErrorKey(id: string, field: string) {
  return `${id}:${field}`
}

function parseNumber(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= -50 && parsed <= 60
    ? parsed
    : undefined
}

function getEditorOptions(
  column: WearLogEditorColumn,
  data: NonNullable<ReturnType<typeof useClosetData>['data']>,
): EditorOption[] {
  if (column.optionGroup === 'condition') {
    return [
      { value: 'no', label: conditionLabels.no },
      { value: 'yes', label: conditionLabels.yes },
      { value: 'unknown', label: conditionLabels.unknown },
    ]
  }
  if (column.optionGroup === 'feeling') {
    return [
      { value: '', label: '미지정' },
      { value: 'cold', label: feelingLabels.cold },
      { value: 'ok', label: feelingLabels.ok },
      { value: 'hot', label: feelingLabels.hot },
    ]
  }
  if (column.optionGroup === 'place') {
    return [
      { value: '', label: '미지정' },
      ...data.places.map((place) => ({ value: place.id, label: place.name })),
    ]
  }
  return [
    { value: '', label: '미지정' },
    ...data.transportModes.map((mode) => ({ value: mode.id, label: mode.name })),
  ]
}

function getBulkOptions(
  field: WearLogBulkField,
  data: NonNullable<ReturnType<typeof useClosetData>['data']>,
) {
  const column = WEAR_LOG_EDITOR_COLUMNS.find((candidate) => candidate.key === field)
  return column ? getEditorOptions(column, data) : []
}

function formatReadOnlyCell(row: WearLogEditorRow, column: WearLogEditorColumn) {
  switch (column.key) {
    case 'outfit':
      return row.outfitName
    case 'place':
      return row.placeName || '미지정'
    case 'transport':
      return row.transportName || '미지정'
    case 'recordId':
      return row.log.id.slice(0, 8)
    default:
      return null
  }
}

function editableValue(log: WearLog, key: WearLogEditableField) {
  return log[key]
}

export function WearLogEditorPage() {
  const {
    data,
    loading,
    error,
    refresh,
    updateWearLogFields,
  } = useClosetData()
  const [filters, setFilters] = useState<WearLogEditorFilters>(
    DEFAULT_WEAR_LOG_EDITOR_FILTERS,
  )
  const [pendingChanges, setPendingChanges] = useState<
    Record<string, WearLogPatch>
  >({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [failedChanges, setFailedChanges] = useState<Record<string, string>>({})
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({})
  const [bulkField, setBulkField] = useState<WearLogBulkField>('transportModeId')
  const [bulkValue, setBulkValue] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50)
  const [saving, setSaving] = useState(false)

  const sourceRows = useMemo<WearLogEditorRow[]>(() => {
    if (!data) return []
    const outfits = new Map(data.outfits.map((outfit) => [outfit.id, outfit]))
    const places = new Map(data.places.map((place) => [place.id, place.name]))
    const transports = new Map(
      data.transportModes.map((mode) => [mode.id, mode.name]),
    )

    return data.wearLogs.map((log) => ({
      log,
      outfitName: outfits.has(log.outfitId)
        ? outfitLabel(outfits.get(log.outfitId)!, data.items)
        : 'Outfit 없음',
      placeName: log.placeId ? places.get(log.placeId) ?? '' : '',
      transportName: log.transportModeId
        ? transports.get(log.transportModeId) ?? ''
        : '',
    }))
  }, [data])

  const rows = useMemo(
    () =>
      sourceRows.map((row) => ({
        ...row,
        log: applyWearLogPatch(row.log, pendingChanges[row.log.id] ?? {}),
      })),
    [pendingChanges, sourceRows],
  )
  const sourceRowById = useMemo(
    () => new Map(sourceRows.map((row) => [row.log.id, row])),
    [sourceRows],
  )
  const filteredRows = useMemo(
    () => filterAndSortWearLogRows(rows, filters),
    [filters, rows],
  )
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )
  const pendingEntries = Object.entries(pendingChanges).filter(([, patch]) =>
    hasWearLogPatch(patch),
  )
  const pendingFieldCount = pendingEntries.reduce(
    (count, [, patch]) => count + Object.keys(patch).length,
    0,
  )
  const selectedRows = rows.filter((row) => selectedIds.has(row.log.id))
  const allPageRowsSelected =
    pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.log.id))
  const bulkOptions = data ? getBulkOptions(bulkField, data) : []

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function updateFilter<K extends keyof WearLogEditorFilters>(
    key: K,
    value: WearLogEditorFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  function resetFilters() {
    setFilters(DEFAULT_WEAR_LOG_EDITOR_FILTERS)
    setPage(1)
  }

  function clearCellError(id: string, field: string) {
    setCellErrors((current) => {
      const key = rowErrorKey(id, field)
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function handleCellChange(
    row: WearLogEditorRow,
    key: WearLogEditableField,
    rawValue: string,
  ) {
    let value: string | number | null = rawValue
    if (key === 'tempOut' || key === 'tempBack') {
      const parsed = parseNumber(rawValue)
      if (parsed === undefined) {
        setCellErrors((current) => ({
          ...current,
          [rowErrorKey(row.log.id, key)]: '-50~60 사이의 정수를 입력하세요.',
        }))
        return
      }
      value = parsed
    } else if (
      key === 'feelingOut' ||
      key === 'feelingBack' ||
      key === 'placeId' ||
      key === 'transportModeId'
    ) {
      value = rawValue || null
    } else if (key === 'memo') {
      value = rawValue.trim() ? rawValue : null
    }

    clearCellError(row.log.id, key)
    setSaveFeedback(null)
    setFailedChanges((current) => {
      if (!current[row.log.id]) return current
      const next = { ...current }
      delete next[row.log.id]
      return next
    })
    setPendingChanges((current) => {
      const source = sourceRowById.get(row.log.id)?.log ?? row.log
      const patch = mergeWearLogPatch(
        source,
        current[row.log.id] ?? {},
        key,
        value as WearLogInput[typeof key],
      )
      const next = { ...current }
      if (hasWearLogPatch(patch)) next[row.log.id] = patch
      else delete next[row.log.id]
      return next
    })
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allPageRowsSelected) {
        pageRows.forEach((row) => next.delete(row.log.id))
      } else {
        pageRows.forEach((row) => next.add(row.log.id))
      }
      return next
    })
  }

  function applyBulkEdit() {
    if (!data || selectedRows.length === 0) return
    const parsedValue = bulkValue === BULK_NULL_VALUE ? null : bulkValue || null
    setSaveFeedback(null)
    setPendingChanges((current) => {
      const next = { ...current }
      for (const row of selectedRows) {
        const source = sourceRowById.get(row.log.id)?.log
        if (!source) continue
        const patch = mergeWearLogPatch(
          source,
          current[row.log.id] ?? {},
          bulkField,
          parsedValue as WearLogInput[typeof bulkField],
        )
        if (hasWearLogPatch(patch)) next[row.log.id] = patch
        else delete next[row.log.id]
      }
      return next
    })
  }

  async function saveChanges() {
    if (pendingEntries.length === 0 || saving) return
    setSaving(true)
    setSaveFeedback(null)
    setFailedChanges({})
    const results = await Promise.all(
      pendingEntries.map(async ([id, patch]) => {
        try {
          await updateWearLogFields(id, patch)
          return { id, error: null }
        } catch (cause) {
          return { id, error: errorMessage(cause) }
        }
      }),
    )
    const succeededIds = results
      .filter((result) => result.error === null)
      .map((result) => result.id)
    const failures = Object.fromEntries(
      results
        .filter((result): result is { id: string; error: string } => result.error !== null)
        .map((result) => [result.id, result.error]),
    )

    await refresh()
    setPendingChanges((current) => {
      const next = { ...current }
      succeededIds.forEach((id) => delete next[id])
      return next
    })
    setFailedChanges(failures)
    setSelectedIds((current) => {
      const next = new Set(current)
      succeededIds.forEach((id) => next.delete(id))
      return next
    })
    setSaveFeedback(
      Object.keys(failures).length > 0
        ? `${succeededIds.length}건 저장, ${Object.keys(failures).length}건 실패. 실패한 행의 변경은 남아 있습니다.`
        : `${succeededIds.length}건 저장하고 최신 값을 다시 불러왔습니다.`,
    )
    setSaving(false)
  }

  function discardChanges() {
    setPendingChanges({})
    setFailedChanges({})
    setCellErrors({})
    setSaveFeedback('저장하지 않은 변경을 모두 취소했습니다.')
  }

  function renderEditableCell(row: WearLogEditorRow, column: WearLogEditorColumn) {
    const key = column.key as WearLogEditableField
    const value = editableValue(row.log, key)
    const fieldError = cellErrors[rowErrorKey(row.log.id, key)]
    const ariaLabel = `${column.label} ${row.log.id.slice(0, 8)}`
    const commonProps = {
      'aria-label': ariaLabel,
      'data-testid': `wear-log-cell-${row.log.id}-${key}`,
    }

    if (column.input === 'select') {
      return (
        <select
          {...commonProps}
          value={(value ?? '') as string}
          onChange={(event) => handleCellChange(row, key, event.target.value)}
        >
          {data && getEditorOptions(column, data).map((option) => (
            <option value={option.value} key={option.value || 'empty'}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    if (column.input === 'number') {
      return (
        <input
          {...commonProps}
          type="number"
          min="-50"
          max="60"
          step="1"
          inputMode="numeric"
          value={(value ?? '') as number | string}
          aria-invalid={Boolean(fieldError)}
          onChange={(event) => handleCellChange(row, key, event.target.value)}
          title={fieldError}
        />
      )
    }

    if (column.input === 'date') {
      return (
        <input
          {...commonProps}
          type="date"
          value={(value ?? '') as string}
          onChange={(event) => handleCellChange(row, key, event.target.value)}
        />
      )
    }

    return (
      <input
        {...commonProps}
        type="text"
        value={(value ?? '') as string}
        onChange={(event) => handleCellChange(row, key, event.target.value)}
      />
    )
  }

  function renderCell(row: WearLogEditorRow, column: WearLogEditorColumn) {
    const patch = pendingChanges[row.log.id]
    const dirty =
      column.editable &&
      (column.key in (patch ?? {}) ||
        (column.key === 'tempBack' && 'tempBackInferred' in (patch ?? {})))

    return (
      <td
        className={dirty ? 'wear-log-editor__cell--dirty' : undefined}
        key={column.key}
      >
        {column.editable ? renderEditableCell(row, column) : (
          <span
            className={column.key === 'recordId' ? 'wear-log-editor__record-id' : undefined}
            title={column.key === 'recordId' ? row.log.id : undefined}
          >
            {formatReadOnlyCell(row, column)}
          </span>
        )}
      </td>
    )
  }

  if (loading && !data) {
    return (
      <AppShell title="Wear Log Editor" eyebrow="Internal maintenance" hideNavigation wide>
        <LoadingState label="Wear Log 데이터를 불러오는 중입니다." />
      </AppShell>
    )
  }

  if (error && !data) {
    return (
      <AppShell title="Wear Log Editor" eyebrow="Internal maintenance" hideNavigation wide>
        <ErrorState message={error} onRetry={() => void refresh()} />
      </AppShell>
    )
  }

  if (!data) return null

  return (
    <AppShell
      title="Wear Log Editor"
      eyebrow="Internal maintenance"
      subtitle="기존 Wear Log를 필터링하고, 변경한 필드만 안전하게 저장합니다."
      hideNavigation
      wide
      action={
        <button
          className="button button--primary"
          type="button"
          onClick={() => void saveChanges()}
          disabled={saving || pendingEntries.length === 0}
        >
          <Save size={17} aria-hidden="true" />
          {saving ? '저장 중…' : `변경 저장${pendingEntries.length ? ` (${pendingEntries.length})` : ''}`}
        </button>
      }
    >
      <div className="wear-log-editor">
        <section className="wear-log-editor__filter-panel" aria-label="Wear Log 필터">
          <div className="wear-log-editor__section-heading">
            <div>
              <p className="eyebrow">READ / FILTER</p>
              <h2>기록 찾기</h2>
            </div>
            <button
              className="button button--secondary"
              type="button"
              onClick={resetFilters}
              disabled={saving}
            >
              <RotateCcw size={15} aria-hidden="true" />
              필터 초기화
            </button>
          </div>

          <div className="wear-log-editor__filters">
            <label className="wear-log-editor__search">
              <span>검색</span>
              <div className="wear-log-editor__search-input">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Wear Log 검색"
                  placeholder="Outfit, 장소, 메모, ID"
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                />
              </div>
            </label>
            <label>
              <span>시작일</span>
              <input
                type="date"
                aria-label="시작일"
                value={filters.from}
                onChange={(event) => updateFilter('from', event.target.value)}
              />
            </label>
            <label>
              <span>종료일</span>
              <input
                type="date"
                aria-label="종료일"
                value={filters.to}
                onChange={(event) => updateFilter('to', event.target.value)}
              />
            </label>
            <label>
              <span>Transport</span>
              <select
                aria-label="Transport 필터"
                value={filters.transportModeId}
                onChange={(event) => updateFilter('transportModeId', event.target.value)}
              >
                <option value="">전체</option>
                {data.transportModes.map((mode) => (
                  <option value={mode.id} key={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Walk 관련</span>
              <select
                aria-label="Walk 필터"
                value={filters.walkFilter}
                onChange={(event) =>
                  updateFilter('walkFilter', event.target.value as WearLogEditorFilters['walkFilter'])
                }
              >
                <option value="all">전체</option>
                <option value="walk">Walk / 도보</option>
                <option value="missing">Transport 미지정</option>
              </select>
            </label>
            <label>
              <span>장소</span>
              <select
                aria-label="장소 필터"
                value={filters.placeId}
                onChange={(event) => updateFilter('placeId', event.target.value)}
              >
                <option value="">전체</option>
                {data.places.map((place) => (
                  <option value={place.id} key={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>정렬</span>
              <select
                aria-label="날짜 정렬"
                value={filters.sort}
                onChange={(event) =>
                  updateFilter('sort', event.target.value as WearLogEditorFilters['sort'])
                }
              >
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
              </select>
            </label>
          </div>
        </section>

        {selectedRows.length > 0 && (
          <section className="wear-log-editor__bulk-panel" aria-label="일괄 편집">
            <div className="wear-log-editor__bulk-title">
              <SlidersHorizontal size={18} aria-hidden="true" />
              <strong>{selectedRows.length}건 선택</strong>
              <span>일괄 변경은 저장 전까지 로컬에만 반영됩니다.</span>
            </div>
            <div className="wear-log-editor__bulk-controls">
              <label>
                <span>필드</span>
                <select
                  aria-label="일괄 편집 필드"
                  value={bulkField}
                  onChange={(event) => {
                    setBulkField(event.target.value as WearLogBulkField)
                    setBulkValue('')
                  }}
                >
                  {WEAR_LOG_BULK_FIELDS.map((field) => (
                    <option value={field} key={field}>
                      {WEAR_LOG_EDITOR_COLUMNS.find((column) => column.key === field)?.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>값</span>
                <select
                  aria-label="일괄 편집 값"
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                >
                  <option value="">값을 선택하세요</option>
                  {bulkOptions.map((option) => (
                    <option
                      value={option.value || BULK_NULL_VALUE}
                      key={option.value || 'empty'}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button--secondary"
                type="button"
                onClick={applyBulkEdit}
                disabled={saving || !bulkValue}
              >
                <Check size={16} aria-hidden="true" />
                선택 행에 적용
              </button>
            </div>
          </section>
        )}

        <section className="wear-log-editor__workspace" aria-label="Wear Log 표">
          <div className="wear-log-editor__workspace-heading">
            <div>
              <p className="eyebrow">EDIT / VERIFY</p>
              <h2>Wear Logs</h2>
            </div>
            <div className="wear-log-editor__counts" role="status" aria-live="polite">
              <span>{filteredRows.length.toLocaleString()} / {data.wearLogs.length.toLocaleString()}건</span>
              <span>{pendingFieldCount ? `미저장 ${pendingFieldCount}개 필드` : '미저장 변경 없음'}</span>
              {loading && <span>새로고침 중…</span>}
            </div>
          </div>

          {saveFeedback && (
            <div className="wear-log-editor__feedback" role="status">
              {saveFeedback}
            </div>
          )}
          {Object.keys(failedChanges).length > 0 && (
            <div className="wear-log-editor__feedback wear-log-editor__feedback--error" role="alert">
              {Object.entries(failedChanges).map(([id, message]) => (
                <p key={id}>
                  <strong>{sourceRowById.get(id)?.log.wornOn ?? id.slice(0, 8)}</strong> · {message}
                </p>
              ))}
            </div>
          )}

          {filteredRows.length === 0 ? (
            <EmptyState
              title="조건에 맞는 Wear Log가 없습니다."
              description="날짜, Transport, Walk 관련 필터나 검색어를 조정해 보세요."
            />
          ) : (
            <>
              <div className="wear-log-editor__table-wrap">
                <table className="wear-log-editor__table">
                  <caption className="sr-only">Wear Log 편집 표</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="wear-log-editor__select-column">
                        <input
                          type="checkbox"
                          aria-label="현재 페이지 전체 선택"
                          checked={allPageRowsSelected}
                          onChange={togglePageSelection}
                        />
                      </th>
                      {WEAR_LOG_EDITOR_COLUMNS.map((column) => (
                        <th scope="col" key={column.key}>
                          {column.label}
                          {column.editable && <span aria-hidden="true">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const dirty = hasWearLogPatch(pendingChanges[row.log.id])
                      const failed = Boolean(failedChanges[row.log.id])
                      return (
                        <tr
                          key={row.log.id}
                          className={[
                            dirty ? 'wear-log-editor__row--dirty' : '',
                            failed ? 'wear-log-editor__row--failed' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <td className="wear-log-editor__select-column">
                            <input
                              type="checkbox"
                              aria-label={`${row.log.wornOn} 행 선택`}
                              checked={selectedIds.has(row.log.id)}
                              onChange={() => toggleSelected(row.log.id)}
                            />
                          </td>
                          {WEAR_LOG_EDITOR_COLUMNS.map((column) => renderCell(row, column))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="wear-log-editor__pagination">
                <label>
                  <span>페이지 크기</span>
                  <select
                    aria-label="페이지 크기"
                    value={pageSize}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
                      setPage(1)
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option value={size} key={size}>
                        {size}건
                      </option>
                    ))}
                  </select>
                </label>
                <span>{currentPage} / {totalPages} 페이지</span>
                <div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="이전 페이지"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="다음 페이지"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <div className="wear-log-editor__footer-actions">
          <span>{selectedRows.length ? `${selectedRows.length}건 선택됨` : '행을 선택하면 일괄 편집이 표시됩니다.'}</span>
          <button
            className="button button--secondary"
            type="button"
            onClick={discardChanges}
            disabled={saving || pendingEntries.length === 0}
          >
            <X size={16} aria-hidden="true" />
            변경 취소
          </button>
        </div>
      </div>
    </AppShell>
  )
}
