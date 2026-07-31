import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { demoData } from '../data/demo-data'
import { DemoRepository } from '../data/demo-repository'
import { HomePage } from './HomePage'

describe('HomePage recommendation pagination', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('reveals recommendation cards three at a time', async () => {
    const user = userEvent.setup()
    const data = structuredClone(demoData)
    const sourceOutfit = data.outfits.find((outfit) =>
      data.wearLogs.some((log) => log.outfitId === outfit.id),
    )
    expect(sourceOutfit).toBeDefined()
    const sourceLogs = data.wearLogs.filter(
      (log) => log.outfitId === sourceOutfit!.id,
    )

    for (let index = 1; index <= 8; index += 1) {
      const outfitId = `pagination-outfit-${index}`
      data.outfits.push({
        ...structuredClone(sourceOutfit!),
        id: outfitId,
        displayName: `Pagination outfit ${index}`,
        preview: null,
        previewState: 'missing',
      })
      data.wearLogs.push(
        ...sourceLogs.map((log, logIndex) => ({
          ...structuredClone(log),
          id: `pagination-log-${index}-${logIndex}`,
          outfitId,
        })),
      )
    }
    window.localStorage.setItem('closet-index-demo-data-v3', JSON.stringify(data))

    render(
      <MemoryRouter>
        <SeasonScopeProvider>
          <DataProvider repository={new DemoRepository()}>
            <HomePage />
          </DataProvider>
        </SeasonScopeProvider>
      </MemoryRouter>,
    )

    await screen.findByText(/실제 착용 기록/)
    await user.click(screen.getByRole('button', { name: '착장 찾기' }))

    const section = (await screen.findByRole('heading', { name: '추천 착장' })).closest(
      'section',
    )
    expect(section).not.toBeNull()
    expect(
      within(section!).getAllByRole('link', { name: /착장 상세 보기/ }),
    ).toHaveLength(3)

    await user.click(within(section!).getByRole('button', { name: '3개 더 보기' }))

    expect(
      within(section!).getAllByRole('link', { name: /착장 상세 보기/ }),
    ).toHaveLength(6)
  })

  it('limits recommendations to the shared season scope', async () => {
    const user = userEvent.setup()
    const data = structuredClone(demoData)
    const sourceItem = data.items.find((item) => item.category.startsWith('Top-'))!
    const sourceOutfit = data.outfits.find((outfit) =>
      data.wearLogs.some((log) => log.outfitId === outfit.id),
    )!
    const sourceLog = data.wearLogs.find(
      (log) => log.outfitId === sourceOutfit.id,
    )!
    const summerItem = {
      ...structuredClone(sourceItem),
      id: 'season-item-summer',
      name: 'Summer season item',
      category: 'Top-Tshirts',
      seasons: ['Summer'],
      acquiredOn: null,
    }
    const winterItem = {
      ...structuredClone(sourceItem),
      id: 'season-item-winter',
      name: 'Winter season item',
      category: 'Top-Knit',
      seasons: ['Winter'],
      acquiredOn: null,
    }

    data.items = [summerItem, winterItem]
    data.outfits = [
      {
        ...structuredClone(sourceOutfit),
        id: 'season-outfit-summer',
        displayName: 'Summer recommendation',
        itemIds: [summerItem.id],
        preview: null,
        previewState: 'missing',
      },
      {
        ...structuredClone(sourceOutfit),
        id: 'season-outfit-winter',
        displayName: 'Winter recommendation',
        itemIds: [winterItem.id],
        preview: null,
        previewState: 'missing',
      },
    ]
    data.wearLogs = [
      {
        ...structuredClone(sourceLog),
        id: 'season-log-summer',
        outfitId: 'season-outfit-summer',
      },
      {
        ...structuredClone(sourceLog),
        id: 'season-log-winter',
        outfitId: 'season-outfit-winter',
      },
    ]
    window.localStorage.setItem('closet-index-demo-data-v3', JSON.stringify(data))
    window.localStorage.setItem(
      'closet-index-season-scope-v1',
      JSON.stringify(['Summer']),
    )

    render(
      <MemoryRouter>
        <SeasonScopeProvider>
          <DataProvider repository={new DemoRepository()}>
            <HomePage />
          </DataProvider>
        </SeasonScopeProvider>
      </MemoryRouter>,
    )

    await screen.findByText(/실제 착용 기록/)
    await user.click(screen.getByRole('button', { name: '착장 찾기' }))

    const section = (await screen.findByRole('heading', { name: '추천 착장' })).closest(
      'section',
    )
    expect(section).not.toBeNull()
    expect(
      within(section!).getByRole('link', {
        name: /Summer recommendation 착장 상세 보기/,
      }),
    ).toBeVisible()
    expect(
      within(section!).queryByRole('link', {
        name: /Winter recommendation 착장 상세 보기/,
      }),
    ).not.toBeInTheDocument()
  })
})
