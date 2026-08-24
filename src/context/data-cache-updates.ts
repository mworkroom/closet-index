import type {
  AppData,
  Item,
  Outfit,
  OutfitItemPlacement,
  OutfitItemPlacementInput,
  WearLog,
} from '../lib/types'

function replaceById<T extends { id: string }>(entries: T[], nextEntry: T): T[] {
  return entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry))
}

function upsertById<T extends { id: string }>(entries: T[], nextEntry: T): T[] {
  return entries.some((entry) => entry.id === nextEntry.id)
    ? replaceById(entries, nextEntry)
    : [...entries, nextEntry]
}

export function applyCreatedItem(data: AppData, item: Item): AppData {
  return {
    ...data,
    items: upsertById(data.items, item),
  }
}

export function applyUpdatedItem(data: AppData, item: Item): AppData {
  return {
    ...data,
    items: replaceById(data.items, item),
  }
}

export function applyCreatedOutfit(data: AppData, outfit: Outfit): AppData {
  return {
    ...data,
    outfits: upsertById(data.outfits, outfit),
  }
}

export function applyUpdatedOutfit(data: AppData, outfit: Outfit): AppData {
  return {
    ...data,
    outfits: replaceById(data.outfits, outfit),
  }
}

export function applyOutfitArchived(
  data: AppData,
  outfitId: string,
  archivedAt: string | null,
): AppData {
  return {
    ...data,
    outfits: data.outfits.map((outfit) =>
      outfit.id === outfitId ? { ...outfit, archivedAt } : outfit,
    ),
  }
}

export function applyOutfitItemPlacement(
  data: AppData,
  input: OutfitItemPlacementInput,
): AppData {
  const nextPlacement: OutfitItemPlacement = {
    itemId: input.itemId,
    slot: input.slot,
    positionX: input.positionX,
    positionY: input.positionY,
    itemScale: input.itemScale,
    zIndex: input.zIndex,
  }

  return {
    ...data,
    outfits: data.outfits.map((outfit) => {
      if (outfit.id !== input.outfitId) return outfit

      const placements = outfit.itemPlacements ?? []
      const hasPlacement = placements.some(
        (placement) => placement.itemId === input.itemId,
      )

      return {
        ...outfit,
        itemPlacements: hasPlacement
          ? placements.map((placement) =>
              placement.itemId === input.itemId
                ? { ...placement, ...nextPlacement }
                : placement,
            )
          : [...placements, nextPlacement],
      }
    }),
  }
}

export function applyUpdatedWearLog(data: AppData, wearLog: WearLog): AppData {
  return {
    ...data,
    wearLogs: replaceById(data.wearLogs, wearLog),
  }
}
