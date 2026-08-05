import { describe, expect, it } from 'vitest'
import { normalizeReplacementLineDecisionReason } from './types'

describe('normalizeReplacementLineDecisionReason', () => {
  it('maps the two retired menu values to their current names', () => {
    expect(normalizeReplacementLineDecisionReason('단순 교체')).toBe('대체 시도')
    expect(normalizeReplacementLineDecisionReason('멸종 후 교체')).toBe('온도 세분화')
  })

  it('preserves current and Legacy Link free-text reasons', () => {
    expect(normalizeReplacementLineDecisionReason('기능 세분화')).toBe('기능 세분화')
    expect(normalizeReplacementLineDecisionReason('구매일이 아니라 확인한 대체 관계')).toBe(
      '구매일이 아니라 확인한 대체 관계',
    )
  })
})
