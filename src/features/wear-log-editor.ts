import type {
  ConditionChoice,
  WearLog,
  WearLogEditableField,
  WearLogInput,
  WearLogPatch,
} from '../lib/types'
import { normalizedHvacIntensity } from '../lib/hvac'

export type WearLogEditorColumnKey =
  | WearLogEditableField
  | 'outfit'
  | 'place'
  | 'transport'
  | 'recordId'

export type WearLogEditorInput =
  | 'date'
  | 'number'
  | 'select'
  | 'text'
  | 'readonly'

export type WearLogEditorOptionGroup =
  | 'condition'
  | 'feeling'
  | 'place'
  | 'transport'
  | 'hvacMode'
  | 'hvacIntensity'

export interface WearLogEditorColumn {
  key: WearLogEditorColumnKey
  label: string
  editable: boolean
  input: WearLogEditorInput
  optionGroup?: WearLogEditorOptionGroup
}

export const WEAR_LOG_EDITOR_COLUMNS: readonly WearLogEditorColumn[] = [
  { key: 'wornOn', label: '날짜', editable: true, input: 'date' },
  { key: 'outfit', label: 'Outfit', editable: false, input: 'readonly' },
  {
    key: 'placeId',
    label: '장소',
    editable: true,
    input: 'select',
    optionGroup: 'place',
  },
  {
    key: 'transportModeId',
    label: 'Transport',
    editable: true,
    input: 'select',
    optionGroup: 'transport',
  },
  {
    key: 'observedHvacMode',
    label: '실제 HVAC',
    editable: true,
    input: 'select',
    optionGroup: 'hvacMode',
  },
  {
    key: 'observedHvacIntensity',
    label: 'HVAC 강도',
    editable: true,
    input: 'select',
    optionGroup: 'hvacIntensity',
  },
  {
    key: 'observedHvacMemo',
    label: 'HVAC 메모',
    editable: true,
    input: 'text',
  },
  { key: 'tempOut', label: '출발 °C', editable: true, input: 'number' },
  { key: 'tempBack', label: '귀가 °C', editable: true, input: 'number' },
  {
    key: 'feelingOut',
    label: '출발 체감',
    editable: true,
    input: 'select',
    optionGroup: 'feeling',
  },
  {
    key: 'feelingBack',
    label: '귀가 체감',
    editable: true,
    input: 'select',
    optionGroup: 'feeling',
  },
  {
    key: 'rainCondition',
    label: '비',
    editable: true,
    input: 'select',
    optionGroup: 'condition',
  },
  {
    key: 'longWalkCondition',
    label: '장거리 걷기',
    editable: true,
    input: 'select',
    optionGroup: 'condition',
  },
  { key: 'memo', label: '메모', editable: true, input: 'text' },
  { key: 'recordId', label: 'ID', editable: false, input: 'readonly' },
]

export const WEAR_LOG_BULK_FIELDS = [
  'transportModeId',
  'longWalkCondition',
  'rainCondition',
  'feelingOut',
  'feelingBack',
] as const satisfies readonly WearLogEditableField[]

export type WearLogBulkField = (typeof WEAR_LOG_BULK_FIELDS)[number]

export interface WearLogEditorRow {
  log: WearLog
  outfitName: string
  placeName: string
  transportName: string
}

export type WearLogWalkFilter = 'all' | 'walk' | 'missing'
export type WearLogSort = 'newest' | 'oldest'

export interface WearLogEditorFilters {
  search: string
  from: string
  to: string
  transportModeId: string
  placeId: string
  walkFilter: WearLogWalkFilter
  rainCondition: ConditionChoice | ''
  longWalkCondition: ConditionChoice | ''
  sort: WearLogSort
}

export const DEFAULT_WEAR_LOG_EDITOR_FILTERS: WearLogEditorFilters = {
  search: '',
  from: '',
  to: '',
  transportModeId: '',
  placeId: '',
  walkFilter: 'all',
  rainCondition: '',
  longWalkCondition: '',
  sort: 'newest',
}

export function isWalkTransportName(name: string) {
  const normalized = name.trim().toLocaleLowerCase('en-US')
  return normalized.includes('walk') || name.includes('도보') || name.includes('걷기')
}

function searchable(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('ko-KR') ?? ''
}

export function filterAndSortWearLogRows(
  rows: readonly WearLogEditorRow[],
  filters: WearLogEditorFilters,
) {
  const query = searchable(filters.search)

  return rows
    .filter((row) => {
      const { log } = row
      if (filters.from && log.wornOn < filters.from) return false
      if (filters.to && log.wornOn > filters.to) return false
      if (filters.transportModeId && log.transportModeId !== filters.transportModeId) {
        return false
      }
      if (filters.placeId && log.placeId !== filters.placeId) return false
      if (filters.rainCondition && log.rainCondition !== filters.rainCondition) {
        return false
      }
      if (
        filters.longWalkCondition &&
        log.longWalkCondition !== filters.longWalkCondition
      ) {
        return false
      }
      if (filters.walkFilter === 'walk' && !isWalkTransportName(row.transportName)) {
        return false
      }
      if (filters.walkFilter === 'missing' && log.transportModeId !== null) {
        return false
      }
      if (!query) return true

      return [
        log.wornOn,
        log.id,
        row.outfitName,
        row.placeName,
        row.transportName,
        log.observedHvacMemo,
        log.memo,
      ].some((value) => searchable(value).includes(query))
    })
    .sort((left, right) => {
      const dateOrder = left.log.wornOn.localeCompare(right.log.wornOn)
      if (dateOrder !== 0) {
        return filters.sort === 'newest' ? -dateOrder : dateOrder
      }
      return left.log.id.localeCompare(right.log.id)
    })
}

export function applyWearLogPatch(log: WearLog, patch: WearLogPatch) {
  return { ...log, ...patch }
}

export function mergeWearLogPatch<K extends WearLogEditableField>(
  source: WearLog,
  current: WearLogPatch,
  field: K,
  value: WearLogInput[K],
) {
  const next = { ...current, [field]: value } as WearLogPatch
  if (field === 'observedHvacMode') {
    const mode = value as WearLogInput['observedHvacMode']
    const currentIntensity =
      next.observedHvacIntensity ?? source.observedHvacIntensity
    next.observedHvacIntensity = normalizedHvacIntensity(
      mode,
      currentIntensity,
    )
  }
  if (field === 'tempBack') {
    const effectiveTempOut = next.tempOut ?? source.tempOut
    next.tempBackInferred = value === null && effectiveTempOut !== null
  }

  for (const key of Object.keys(next) as Array<keyof WearLogPatch>) {
    if (next[key] === source[key]) delete next[key]
  }
  return next
}

export function hasWearLogPatch(patch: WearLogPatch | undefined) {
  return Boolean(patch && Object.keys(patch).length > 0)
}
