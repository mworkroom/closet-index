import { describe, expect, it } from 'vitest'
import { replacementLineDecisionReasonLabel } from './types'

describe('replacementLineDecisionReasonLabel', () => {
  it('uses the same current values for storage and display', () => {
    expect(replacementLineDecisionReasonLabel('대체 시도')).toBe('대체 시도')
    expect(replacementLineDecisionReasonLabel('온도 세분화')).toBe('온도 세분화')
  })

  it('preserves current and Legacy Link free-text reasons', () => {
    expect(replacementLineDecisionReasonLabel('기능 세분화')).toBe('기능 세분화')
    expect(replacementLineDecisionReasonLabel('구매일이 아니라 확인한 대체 관계')).toBe(
      '구매일이 아니라 확인한 대체 관계',
    )
  })
})
