import type {
  HvacIntensity,
  HvacMode,
  PlaceHvacProfileSource,
} from './types'

export const HVAC_MODES = ['cooling', 'heating', 'off'] as const
export const HVAC_INTENSITIES = ['weak', 'normal', 'strong'] as const

export const hvacModeLabels: Record<HvacMode, string> = {
  cooling: '냉방',
  heating: '난방',
  off: '냉난방 안 함',
}

export const hvacIntensityLabels: Record<HvacIntensity, string> = {
  weak: '약함',
  normal: '보통',
  strong: '강함',
}

export const placeHvacProfileSourceLabels: Record<
  PlaceHvacProfileSource,
  string
> = {
  manual: '직접 판단',
  wear_log_observation: 'Wear Log 관측 기반',
}

export function normalizedHvacIntensity(
  mode: HvacMode,
  intensity: HvacIntensity | null,
) {
  if (mode === 'off') return null
  return intensity ?? 'normal'
}
