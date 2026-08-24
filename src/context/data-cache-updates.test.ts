import { describe, expect, it } from 'vitest'
import type { AppData, Item, Outfit, WearLog } from '../lib/types'
import {
  applyCreatedItem,
  applyCreatedOutfit,
  applyOutfitArchived,
  applyOutfitItemPlacement,
  applyUpdatedItem,
  applyUpdatedOutfit,
  applyUpdatedWearLog,
} from './data-cache-updates'

const item: Item = {
  id: 'item-1',
  name: 'Top',
  category: 'Tops',
  semanticColor: null,
  displayHex: '#ffffff',
  seasons: ['Spring'],
  retired: false,
  rainOk: false,
  longWalkOk: false,
  memo: null,
  acquiredOn: null,
}

const outfit: Outfit = {
  id: 'outfit-1',
  displayName: 'Original',
  rating: null,
  archivedAt: null,
  itemIds: [item.id],
  itemPlacements: [
    {
      itemId: item.id,
      slot: 'main',
      positionX: 0,
      positionY: 0,
      itemScale: 1,
      zIndex: 1,
    },
  ],
}

const wearLog: WearLog = {
  id: 'wear-log-1',
  outfitId: outfit.id,
  wornOn: '2026-08-24',
  tempOut: null,
  tempBack: null,
  tempBackInferred: false,
  feelingOut: null,
  feelingBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: null,
  transportModeId: null,
  observedHvacMode: 'off',
  observedHvacIntensity: null,
  memo: null,
  temperatureSource: 'manual',
  weatherLocationId: null,
  weatherIssuedAt: null,
  weatherOverridden: false,
  submissionToken: 'submission-1',
  createdAt: '2026-08-24T00:00:00.000Z',
}

const appData: AppData = {
  items: [item],
  outfits: [outfit],
  wearLogs: [wearLog],
  places: [],
  placeHvacProfiles: [],
  transportModes: [],
}

describe('DataContext cache updates', () => {
  it('appends a new item and replaces a created item with the same id', () => {
    const addedItem = { ...item, id: 'item-2', name: 'Bottom' }
    const added = applyCreatedItem(appData, addedItem)
    const replacedItem = { ...item, name: 'Renamed top' }
    const replaced = applyCreatedItem(appData, replacedItem)

    expect(added.items).toEqual([item, addedItem])
    expect(replaced.items).toEqual([replacedItem])
    expect(appData.items).toEqual([item])
  })

  it('updates an existing item without appending an unknown item', () => {
    const updatedItem = { ...item, memo: 'Updated' }
    const unknownItem = { ...item, id: 'missing-item' }

    expect(applyUpdatedItem(appData, updatedItem).items).toEqual([updatedItem])
    expect(applyUpdatedItem(appData, unknownItem).items).toEqual([item])
  })

  it('upserts created outfits and only replaces existing updated outfits', () => {
    const addedOutfit = { ...outfit, id: 'outfit-2', displayName: 'Added' }
    const updatedOutfit = { ...outfit, displayName: 'Updated' }
    const unknownOutfit = { ...outfit, id: 'missing-outfit' }

    expect(applyCreatedOutfit(appData, addedOutfit).outfits).toEqual([
      outfit,
      addedOutfit,
    ])
    expect(applyCreatedOutfit(appData, updatedOutfit).outfits).toEqual([
      updatedOutfit,
    ])
    expect(applyUpdatedOutfit(appData, updatedOutfit).outfits).toEqual([
      updatedOutfit,
    ])
    expect(applyUpdatedOutfit(appData, unknownOutfit).outfits).toEqual([outfit])
  })

  it('sets and clears the archive timestamp without mutating loaded data', () => {
    const archivedAt = '2026-08-24T01:00:00.000Z'
    const archived = applyOutfitArchived(appData, outfit.id, archivedAt)
    const restored = applyOutfitArchived(archived, outfit.id, null)

    expect(archived.outfits[0].archivedAt).toBe(archivedAt)
    expect(restored.outfits[0].archivedAt).toBeNull()
    expect(appData.outfits[0].archivedAt).toBeNull()
  })

  it('replaces an existing placement and appends a missing placement', () => {
    const repositioned = applyOutfitItemPlacement(appData, {
      outfitId: outfit.id,
      itemId: item.id,
      slot: 'top',
      positionX: 8,
      positionY: -4,
      itemScale: 1.2,
      zIndex: 3,
    })
    const appended = applyOutfitItemPlacement(appData, {
      outfitId: outfit.id,
      itemId: 'item-2',
      slot: null,
      positionX: 1,
      positionY: 2,
      itemScale: 0.9,
      zIndex: null,
    })

    expect(repositioned.outfits[0].itemPlacements).toEqual([
      {
        itemId: item.id,
        slot: 'top',
        positionX: 8,
        positionY: -4,
        itemScale: 1.2,
        zIndex: 3,
      },
    ])
    expect(appended.outfits[0].itemPlacements).toHaveLength(2)
    expect(appData.outfits[0].itemPlacements?.[0].slot).toBe('main')
  })

  it('replaces an existing Wear Log without appending an unknown log', () => {
    const updatedLog = { ...wearLog, memo: 'Updated' }
    const unknownLog = { ...wearLog, id: 'missing-log' }

    expect(applyUpdatedWearLog(appData, updatedLog).wearLogs).toEqual([
      updatedLog,
    ])
    expect(applyUpdatedWearLog(appData, unknownLog).wearLogs).toEqual([wearLog])
  })
})
