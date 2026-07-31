import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClosetRepository } from '../data/repository'
import type { AppData } from '../lib/types'
import { DataProvider, useClosetData } from './DataContext'

const appData: AppData = {
  items: [],
  outfits: [
    {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: ['item'],
      itemPlacements: [
        {
          itemId: 'item',
          slot: 'main-bottom',
          positionX: 0,
          positionY: 0,
          itemScale: 1,
          zIndex: 10,
        },
      ],
    },
  ],
  wearLogs: [],
  places: [],
  transportModes: [],
}

function PositionProbe() {
  const { data, loading, updateOutfitItemPlacement } = useClosetData()
  const placement = data?.outfits[0]?.itemPlacements?.[0]

  return (
    <>
      <span>{loading ? 'loading' : 'ready'}</span>
      <span>
        {placement
          ? `${placement.slot},${placement.positionX},${placement.positionY},${placement.itemScale},${placement.zIndex}`
          : 'no-placement'}
      </span>
      <button
        type="button"
        onClick={() =>
          void updateOutfitItemPlacement({
            outfitId: 'outfit',
            itemId: 'item',
            slot: 'top',
            positionX: 4,
            positionY: -8,
            itemScale: 1.15,
            zIndex: 0,
          })
        }
      >
        save
      </button>
    </>
  )
}

describe('DataProvider outfit placement updates', () => {
  it('updates the loaded outfit without reloading all app data', async () => {
    const user = userEvent.setup()
    const repository: ClosetRepository = {
      load: vi.fn(async () => structuredClone(appData)),
      createItem: vi.fn(),
      updateItem: vi.fn(),
      replaceItemImage: vi.fn(async () => undefined),
      setItemRetired: vi.fn(async () => undefined),
      updateItemSuitability: vi.fn(async () => undefined),
      findMatchingOutfits: vi.fn(),
      createOutfit: vi.fn(),
      cloneOutfit: vi.fn(),
      setOutfitArchived: vi.fn(async () => undefined),
      updateOutfitItemPlacement: vi.fn(async () => undefined),
      saveDefaultWeatherLocation: vi.fn(),
      fetchWeatherForecast: vi.fn(),
      createWearLog: vi.fn(),
      updateWearLog: vi.fn(),
      deleteWearLog: vi.fn(async () => undefined),
    }

    render(
      <DataProvider repository={repository}>
        <PositionProbe />
      </DataProvider>,
    )

    expect(await screen.findByText('main-bottom,0,0,1,10')).toBeInTheDocument()
    expect(repository.load).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'save' }))

    expect(await screen.findByText('top,4,-8,1.15,0')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(repository.load).toHaveBeenCalledTimes(1)
    expect(repository.updateOutfitItemPlacement).toHaveBeenCalledWith({
      outfitId: 'outfit',
      itemId: 'item',
      slot: 'top',
      positionX: 4,
      positionY: -8,
      itemScale: 1.15,
      zIndex: 0,
    })
  })
})
