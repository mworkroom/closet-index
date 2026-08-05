import type { ReplacementLineOverviewRow } from './replacement-line-overview'

export type ReplacementLineSurvivalKind =
  | 'extinct'
  | 'endangered'
  | 'replacement_check'

export interface ReplacementLineSurvivalStatus {
  kind: ReplacementLineSurvivalKind
  label: '💀 멸종' | '⚠️ 멸종 위기' | '🔎 대체품 점검'
  accessibleLabel: string
  newestActiveAgeYears: number | null
  riskThresholdYears: number
}

type ReplacementLineSurvivalInput = Pick<
  ReplacementLineOverviewRow,
  | 'styleIdentity'
  | 'lifecycleStatus'
  | 'activeItems'
  | 'retiredItems'
  | 'newestActiveAcquiredOn'
  | 'hiddenMembershipCount'
>

const RISK_THRESHOLDS = [
  { identity: 'bag', years: 5 },
  { identity: 'shoes', years: 4 },
  { identity: 'layeredtop', years: 2 },
  { identity: 'tee', years: 2 },
  { identity: 'socks', years: 1 },
] as const

function normalizeStyleIdentity(value: string | null) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase('en-US')
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null

  return { year, month, day }
}

export function getReplacementLineRiskThreshold(styleIdentity: string | null) {
  const normalized = normalizeStyleIdentity(styleIdentity)
  return (
    RISK_THRESHOLDS.find(({ identity }) => normalized.includes(identity))
      ?.years ?? 3
  )
}

export function getCompletedCalendarYears(
  acquiredOn: string,
  today: string,
): number | null {
  const acquired = parseCalendarDate(acquiredOn)
  const current = parseCalendarDate(today)
  if (!acquired || !current || acquiredOn > today) return null

  const anniversaryHasPassed =
    current.month > acquired.month ||
    (current.month === acquired.month && current.day >= acquired.day)

  return current.year - acquired.year - (anniversaryHasPassed ? 0 : 1)
}

export function getReplacementLineSurvivalStatus(
  line: ReplacementLineSurvivalInput,
  today: string,
): ReplacementLineSurvivalStatus | null {
  const riskThresholdYears = getReplacementLineRiskThreshold(line.styleIdentity)
  const resolvedItemCount = line.activeItems.length + line.retiredItems.length

  if (
    line.lifecycleStatus !== 'active' ||
    line.hiddenMembershipCount > 0 ||
    resolvedItemCount === 0
  ) {
    return null
  }

  if (line.activeItems.length === 0) {
    return {
      kind: 'extinct',
      label: '💀 멸종',
      accessibleLabel: '💀 멸종: 현재 사용할 대체 Item 없음',
      newestActiveAgeYears: null,
      riskThresholdYears,
    }
  }

  if (!line.newestActiveAcquiredOn) return null
  const newestActiveAgeYears = getCompletedCalendarYears(
    line.newestActiveAcquiredOn,
    today,
  )
  if (newestActiveAgeYears === null) return null

  if (newestActiveAgeYears >= riskThresholdYears) {
    return {
      kind: 'endangered',
      label: '⚠️ 멸종 위기',
      accessibleLabel: '⚠️ 멸종 위기: 대체품 교체 시기 임박',
      newestActiveAgeYears,
      riskThresholdYears,
    }
  }

  if (newestActiveAgeYears >= riskThresholdYears - 1) {
    return {
      kind: 'replacement_check',
      label: '🔎 대체품 점검',
      accessibleLabel: '🔎 대체품 점검: 대체품 탐색 점검 시기',
      newestActiveAgeYears,
      riskThresholdYears,
    }
  }

  return null
}
