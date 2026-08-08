import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { phase5RecommendationBaselineFixture } from '../../lib/fixtures/phase5-recommendation-baseline'
import { recommendOutfits } from '../../lib/recommendation'
import type { RecommendationInput } from '../../lib/types'
import { RecentPurchaseSection } from './RecentPurchaseSection'

const input: RecommendationInput = {
  tempOut: 20,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'place-a',
  transportModeId: 'transport-a',
}

const results = recommendOutfits(phase5RecommendationBaselineFixture, input)

afterEach(cleanup)

describe('RecentPurchaseSection variable card count', () => {
  for (const count of [0, 1, 2, 3]) {
    it(`renders ${count} cards without placeholders`, () => {
      const { container } = render(
        <MemoryRouter>
          <RecentPurchaseSection
            data={phase5RecommendationBaselineFixture}
            input={input}
            recommendations={results.slice(0, count)}
          />
        </MemoryRouter>,
      )

      if (count === 0) {
        expect(container).toBeEmptyDOMElement()
        expect(
          screen.queryByRole('heading', { name: '최근 구매 착장' }),
        ).not.toBeInTheDocument()
        return
      }

      const section = screen
        .getByRole('heading', { name: '최근 구매 착장' })
        .closest('section')
      expect(section).not.toBeNull()
      expect(within(section!).getByText(`${count}개 후보`)).toBeVisible()
      expect(
        within(section!).getAllByRole('link', { name: /착장 상세 보기/ }),
      ).toHaveLength(count)
    })
  }
})
