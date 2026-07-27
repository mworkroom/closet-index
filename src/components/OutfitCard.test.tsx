import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demo-data'
import { recommendOutfits } from '../lib/recommendation'
import type { RecommendationInput } from '../lib/types'
import { outfitLabel } from '../lib/outfits'
import { OutfitCard } from './OutfitCard'

const input: RecommendationInput = {
  tempOut: 20,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: null,
  transportModeId: null,
}

describe('OutfitCard home layout', () => {
  it('착장 제목을 숨기고 구조화된 착용·추천 요약을 표시한다', () => {
    const recommendation = recommendOutfits(demoData, input).find(
      (result) => result.outfit.id === 'outfit-favorite',
    )
    if (!recommendation?.okRange) throw new Error('recommendation fixture missing')

    const label = outfitLabel(recommendation.outfit, demoData.items)

    render(
      <MemoryRouter>
        <OutfitCard
          outfit={recommendation.outfit}
          data={demoData}
          recommendation={recommendation}
          layout="home"
        />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: `${label} 착장 상세 보기` }),
    ).toHaveClass('outfit-card--home')
    expect(screen.queryByRole('heading', { name: label })).not.toBeInTheDocument()
    expect(
      screen.getByText(`착용 ${recommendation.wearCount}회`),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        `${recommendation.okRange.min}~${recommendation.okRange.max}°C 적정 범위`,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`OK ${recommendation.okObservationCount}회`),
    ).toBeInTheDocument()
  })
})
