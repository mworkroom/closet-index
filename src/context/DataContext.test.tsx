import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClosetDataProviderRepository } from '../data/repository'
import type { AppData } from '../lib/types'
import {
  DataProvider,
  useClosetActions,
  useClosetData,
  useClosetDataState,
} from './DataContext'

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
  placeHvacProfiles: [],
  transportModes: [],
}

afterEach(cleanup)

function createRepository(
  overrides: Partial<ClosetDataProviderRepository> = {},
): ClosetDataProviderRepository {
  return {
    load: vi.fn(async () => structuredClone(appData)),
    replacementLines: {} as ClosetDataProviderRepository['replacementLines'],
    purchases: {} as ClosetDataProviderRepository['purchases'],
    care: {} as ClosetDataProviderRepository['care'],
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(async () => undefined),
    replaceItemImage: vi.fn(async () => undefined),
    setItemRetired: vi.fn(async () => undefined),
    updateItemSuitability: vi.fn(async () => undefined),
    findMatchingOutfits: vi.fn(),
    createOutfit: vi.fn(),
    updateOutfit: vi.fn(),
    deleteOutfit: vi.fn(async () => undefined),
    setOutfitArchived: vi.fn(async () => undefined),
    updateOutfitItemPlacement: vi.fn(async () => undefined),
    saveDefaultWeatherLocation: vi.fn(),
    fetchWeatherForecast: vi.fn(),
    savePlaceHvacProfile: vi.fn(),
    createWearLog: vi.fn(),
    updateWearLog: vi.fn(),
    updateWearLogFields: vi.fn(),
    deleteWearLog: vi.fn(async () => undefined),
    ...overrides,
  }
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

function CreateOutfitProbe() {
  const { data, loading, createOutfit } = useClosetData()

  return (
    <>
      <span>{loading ? 'loading' : 'ready'}</span>
      <span>{data?.outfits.map((outfit) => outfit.id).join(',') ?? ''}</span>
      <button
        type="button"
        onClick={() =>
          void createOutfit({
            id: 'new-outfit',
            displayName: '새 착장',
            allowDuplicate: false,
            items: [],
          })
        }
      >
        create
      </button>
    </>
  )
}

function ArchiveOutfitProbe() {
  const { data, setOutfitArchived } = useClosetData()
  const outfit = data?.outfits[0]

  return (
    <>
      <span>{outfit?.archivedAt ? 'archived' : 'active'}</span>
      <button
        type="button"
        onClick={() => void setOutfitArchived('outfit', true)}
      >
        archive
      </button>
    </>
  )
}

function DataLoadingProbe() {
  const { loading } = useClosetDataState()
  return <span>{loading ? 'state-loading' : 'state-ready'}</span>
}

function ActionsRenderProbe({ onRender }: { onRender: () => void }) {
  onRender()
  const { refresh } = useClosetActions()
  return (
    <button type="button" onClick={() => void refresh()}>
      refresh
    </button>
  )
}

function OutfitErrorProbe() {
  const { error } = useClosetDataState()
  const { createOutfit } = useClosetActions()

  return (
    <>
      <span>{error ?? 'no-action-error'}</span>
      <button
        type="button"
        onClick={() =>
          void createOutfit({
            id: 'failed-outfit',
            displayName: null,
            allowDuplicate: false,
            items: [],
          }).catch(() => undefined)
        }
      >
        fail create
      </button>
    </>
  )
}

describe('DataProvider actions and context boundaries', () => {
  it('updates the loaded outfit without reloading all app data', async () => {
    const user = userEvent.setup()
    const repository = createRepository()

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

  it('adds a newly created outfit to the loaded data without reloading', async () => {
    const user = userEvent.setup()
    const createdOutfit = {
      id: 'new-outfit',
      displayName: '새 착장',
      rating: null,
      archivedAt: null,
      itemIds: [],
      itemPlacements: [],
    }
    const repository = createRepository({
      createOutfit: vi.fn(async () => createdOutfit),
    })

    render(
      <DataProvider repository={repository}>
        <CreateOutfitProbe />
      </DataProvider>,
    )

    expect(await screen.findByText('outfit')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'create' }))

    expect(await screen.findByText('outfit,new-outfit')).toBeInTheDocument()
    expect(repository.load).toHaveBeenCalledTimes(1)
    expect(repository.createOutfit).toHaveBeenCalledTimes(1)
  })

  it('updates an Outfit archive state without reloading Wear Logs or relations', async () => {
    const user = userEvent.setup()
    const repository = createRepository()

    render(
      <DataProvider repository={repository}>
        <ArchiveOutfitProbe />
      </DataProvider>,
    )

    expect(await screen.findByText('active')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'archive' }))

    expect(await screen.findByText('archived')).toBeInTheDocument()
    expect(repository.setOutfitArchived).toHaveBeenCalledWith('outfit', true)
    expect(repository.load).toHaveBeenCalledTimes(1)
  })

  it('does not re-render an actions-only consumer when data state refreshes', async () => {
    const user = userEvent.setup()
    const onRender = vi.fn()
    const repository = createRepository()

    render(
      <DataProvider repository={repository}>
        <DataLoadingProbe />
        <ActionsRenderProbe onRender={onRender} />
      </DataProvider>,
    )

    expect(await screen.findByText('state-ready')).toBeInTheDocument()
    expect(onRender).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(2))

    expect(screen.getByText('state-ready')).toBeInTheDocument()
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it('preserves the Outfit fallback error when a non-Error rejection occurs', async () => {
    const user = userEvent.setup()
    const repository = createRepository({
      createOutfit: vi.fn(async () => {
        throw 'failed'
      }),
    })

    render(
      <DataProvider repository={repository}>
        <OutfitErrorProbe />
      </DataProvider>,
    )

    expect(await screen.findByText('no-action-error')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'fail create' }))

    expect(
      await screen.findByText('Outfit을 저장하지 못했습니다.'),
    ).toBeInTheDocument()
    expect(repository.createOutfit).toHaveBeenCalledWith({
      id: 'failed-outfit',
      displayName: null,
      allowDuplicate: false,
      items: [],
    })
  })
})
