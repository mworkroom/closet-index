import { describe, expect, it } from 'vitest'
import {
  createStatisticsItemListUrl,
  readStatisticsItemListSearchParams,
} from './statistics-navigation'

describe('statistics item-list navigation', () => {
  it('round-trips result kind and independent statistics filters through the URL', () => {
    const url = createStatisticsItemListUrl('unworn', {
      period: { kind: 'year', year: 2025 },
      seasons: ['Winter', 'Spring'],
      categories: ['top', 'made'],
      colors: ['Black', 'Ivory'],
      excludeRetired: true,
    })
    const parsed = readStatisticsItemListSearchParams(
      new URL(url, 'https://closet.test').searchParams,
    )

    expect(parsed).toEqual({
      kind: 'unworn',
      filters: {
        period: { kind: 'year', year: 2025 },
        seasons: ['Winter', 'Spring'],
        categories: ['top', 'made'],
        colors: ['Black', 'Ivory'],
        excludeRetired: true,
      },
    })
  })

  it('drops invalid values and falls back to the safe lifetime list', () => {
    const parsed = readStatisticsItemListSearchParams(
      new URLSearchParams(
        'result=unknown&period=bad&season=Winter&season=Unknown&category=top&category=nope&color=Black&color=Navy&color=Unknown',
      ),
    )

    expect(parsed).toEqual({
      kind: 'most-worn',
      filters: {
        period: { kind: 'lifetime' },
        seasons: ['Winter'],
        categories: ['top'],
        colors: ['Black', 'Navy'],
        excludeRetired: false,
      },
    })
  })
})
