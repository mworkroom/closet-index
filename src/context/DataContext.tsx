import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  AppData,
  Item,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  MatchingOutfit,
  Outfit,
  OutfitCreateInput,
  OutfitUpdateInput,
  OutfitItemPlacementInput,
  OutfitPreviewUploadInput,
  ReplacementLineSnapshot,
  ReplacementLegacyLink,
  ReplacementLegacyLinkReviewInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocationInput,
  WearLogInput,
} from '../lib/types'
import type { ClosetRepository } from '../data/repository'
import { getImageRefreshDelay } from '../data/image-assets'

interface DataState {
  data: AppData | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  loadReplacementLines: () => Promise<ReplacementLineSnapshot>
  loadReplacementLegacyLinks: () => Promise<ReplacementLegacyLink[]>
  reviewReplacementLegacyLink: (
    linkId: string,
    input: ReplacementLegacyLinkReviewInput,
  ) => Promise<ReplacementLegacyLink>
  createItem: (input: ItemCreateInput) => Promise<Item>
  updateItem: (itemId: string, input: ItemWriteInput) => Promise<Item>
  replaceItemImage: (
    itemId: string,
    input: ItemImageUploadInput,
  ) => Promise<void>
  setItemRetired: (itemId: string, retired: boolean) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
  updateItemSuitability: (
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) => Promise<void>
  findMatchingOutfits: (itemIds: string[]) => Promise<MatchingOutfit[]>
  createOutfit: (input: OutfitCreateInput) => Promise<Outfit>
  updateOutfit: (outfitId: string, input: OutfitUpdateInput) => Promise<Outfit>
  setOutfitArchived: (outfitId: string, archived: boolean) => Promise<void>
  deleteOutfit: (outfitId: string) => Promise<void>
  updateOutfitItemPlacement: (input: OutfitItemPlacementInput) => Promise<void>
  replaceOutfitPreview: (
    outfitId: string,
    input: OutfitPreviewUploadInput,
  ) => Promise<void>
  saveDefaultWeatherLocation: (input: WeatherLocationInput) => Promise<void>
  fetchWeatherForecast: (
    input: WeatherForecastRequest,
  ) => Promise<WeatherForecastResponse>
  createWearLog: (input: WearLogInput) => Promise<void>
  updateWearLog: (id: string, input: WearLogInput) => Promise<void>
  deleteWearLog: (id: string) => Promise<void>
}

const DataContext = createContext<DataState | null>(null)

export function DataProvider({
  repository,
  children,
}: PropsWithChildren<{ repository: ClosetRepository }>) {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshSequence = useRef(0)

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setLoading(true)
    setError(null)
    try {
      const nextData = await repository.load()
      if (sequence === refreshSequence.current) {
        setData(nextData)
      }
    } catch (cause) {
      if (sequence === refreshSequence.current) {
        setError(cause instanceof Error ? cause.message : '데이터를 불러오지 못했습니다.')
      }
    } finally {
      if (sequence === refreshSequence.current) {
        setLoading(false)
      }
    }
  }, [repository])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!data) return
    const delay = getImageRefreshDelay(data)
    if (delay === null) return

    const timeout = window.setTimeout(() => {
      void refresh()
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [data, refresh])

  const mutate = useCallback(
    async (operation: () => Promise<unknown>) => {
      setError(null)
      try {
        await operation()
        await refresh()
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '저장하지 못했습니다.'
        setError(message)
        throw cause
      }
    },
    [refresh],
  )

  const updateOutfitItemPlacement = useCallback(
    async (input: OutfitItemPlacementInput) => {
      setError(null)
      try {
        await repository.updateOutfitItemPlacement(input)
        setData((current) => {
          if (!current) return current

          return {
            ...current,
            outfits: current.outfits.map((outfit) => {
              if (outfit.id !== input.outfitId) return outfit

              const placements = outfit.itemPlacements ?? []
              const hasPlacement = placements.some(
                (placement) => placement.itemId === input.itemId,
              )
              const nextPlacement = {
                itemId: input.itemId,
                slot: input.slot,
                positionX: input.positionX,
                positionY: input.positionY,
                itemScale: input.itemScale,
                zIndex: input.zIndex,
              }

              return {
                ...outfit,
                preview: null,
                previewState:
                  outfit.preview || outfit.previewState === 'ready'
                    ? 'stale'
                    : (outfit.previewState ?? 'missing'),
                itemPlacements: hasPlacement
                  ? placements.map((placement) =>
                      placement.itemId === input.itemId
                        ? {
                          ...placement,
                          slot: input.slot,
                          positionX: input.positionX,
                          positionY: input.positionY,
                          itemScale: input.itemScale,
                          zIndex: input.zIndex,
                          }
                        : placement,
                    )
                  : [...placements, nextPlacement],
              }
            }),
          }
        })
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '저장하지 못했습니다.'
        setError(message)
        throw cause
      }
    },
    [repository],
  )

  const findMatchingOutfits = useCallback(
    (itemIds: string[]) => repository.findMatchingOutfits(itemIds),
    [repository],
  )

  const loadReplacementLines = useCallback(() => {
    if (!repository.loadReplacementLines) {
      return Promise.reject(
        new Error('이 환경에서는 Replacement Line 조회를 지원하지 않습니다.'),
      )
    }
    return repository.loadReplacementLines()
  }, [repository])

  const loadReplacementLegacyLinks = useCallback(() => {
    if (!repository.loadReplacementLegacyLinks) {
      return Promise.reject(
        new Error('이 환경에서는 Legacy Link 조회를 지원하지 않습니다.'),
      )
    }
    return repository.loadReplacementLegacyLinks()
  }, [repository])

  const reviewReplacementLegacyLink = useCallback(
    (linkId: string, input: ReplacementLegacyLinkReviewInput) => {
      if (!repository.reviewReplacementLegacyLink) {
        return Promise.reject(
          new Error('이 환경에서는 Legacy Link 검토를 지원하지 않습니다.'),
        )
      }
      return repository.reviewReplacementLegacyLink(linkId, input)
    },
    [repository],
  )

  const replaceOutfitPreview = useCallback(
    async (outfitId: string, input: OutfitPreviewUploadInput) => {
      if (!repository.replaceOutfitPreview) {
        throw new Error('이 환경에서는 Outfit preview 저장을 지원하지 않습니다.')
      }
      await repository.replaceOutfitPreview(outfitId, input)
      await refresh()
    },
    [refresh, repository],
  )

  const createOutfit = useCallback(
    async (input: OutfitCreateInput) => {
      setError(null)
      try {
        const outfit = await repository.createOutfit(input)
        setData((current) =>
          current
            ? {
                ...current,
                outfits: current.outfits.some((entry) => entry.id === outfit.id)
                  ? current.outfits.map((entry) =>
                      entry.id === outfit.id ? outfit : entry,
                    )
                  : [...current.outfits, outfit],
              }
            : current,
        )
        return outfit
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Outfit을 저장하지 못했습니다.'
        setError(message)
        throw cause
      }
    },
    [repository],
  )

  const setOutfitArchived = useCallback(
    async (outfitId: string, archived: boolean) => {
      setError(null)
      try {
        await repository.setOutfitArchived(outfitId, archived)
        setData((current) =>
          current
            ? {
                ...current,
                outfits: current.outfits.map((outfit) =>
                  outfit.id === outfitId
                    ? {
                        ...outfit,
                        archivedAt: archived ? new Date().toISOString() : null,
                      }
                    : outfit,
                ),
              }
            : current,
        )
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Outfit 상태를 바꾸지 못했습니다.'
        setError(message)
        throw cause
      }
    },
    [repository],
  )

  const updateOutfit = useCallback(
    async (outfitId: string, input: OutfitUpdateInput) => {
      setError(null)
      try {
        const outfit = await repository.updateOutfit(outfitId, input)
        setData((current) =>
          current
            ? {
                ...current,
                outfits: current.outfits.map((entry) =>
                  entry.id === outfit.id ? outfit : entry,
                ),
              }
            : current,
        )
        return outfit
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Outfit을 수정하지 못했습니다.'
        setError(message)
        throw cause
      }
    },
    [repository],
  )

  const createItem = useCallback(
    async (input: ItemCreateInput) => {
      setError(null)
      try {
        const item = await repository.createItem(input)
        setData((current) =>
          current
            ? {
                ...current,
                items: current.items.some((entry) => entry.id === item.id)
                  ? current.items.map((entry) =>
                      entry.id === item.id ? item : entry,
                    )
                  : [...current.items, item],
              }
            : current,
        )
        return item
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : '저장하지 못했습니다.'
        setError(message)
        throw cause
      }
    },
    [repository],
  )

  const updateItem = useCallback(
    async (itemId: string, input: ItemWriteInput) => {
      setError(null)
      try {
        const item = await repository.updateItem(itemId, input)
        setData((current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.id === item.id ? item : entry,
                ),
              }
            : current,
        )
        return item
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : '저장하지 못했습니다.'
        setError(message)
        throw cause
      }
    },
    [repository],
  )

  const value = useMemo<DataState>(
    () => ({
      data,
      loading,
      error,
      refresh,
      loadReplacementLines,
      loadReplacementLegacyLinks,
      reviewReplacementLegacyLink,
      createItem,
      updateItem,
      replaceItemImage: (itemId, input) =>
        mutate(() => repository.replaceItemImage(itemId, input)),
      setItemRetired: (itemId, retired) =>
        mutate(() => repository.setItemRetired(itemId, retired)),
      deleteItem: (itemId) => mutate(() => repository.deleteItem(itemId)),
      updateItemSuitability: (itemId, rainOk, longWalkOk) =>
        mutate(() => repository.updateItemSuitability(itemId, rainOk, longWalkOk)),
      findMatchingOutfits,
      createOutfit,
      updateOutfit,
      setOutfitArchived,
      deleteOutfit: (outfitId) =>
        mutate(() => repository.deleteOutfit(outfitId)),
      updateOutfitItemPlacement,
      replaceOutfitPreview,
      saveDefaultWeatherLocation: (input) =>
        mutate(() => repository.saveDefaultWeatherLocation(input)),
      fetchWeatherForecast: (input) => repository.fetchWeatherForecast(input),
      createWearLog: (input) => mutate(() => repository.createWearLog(input)),
      updateWearLog: (id, input) => mutate(() => repository.updateWearLog(id, input)),
      deleteWearLog: (id) => mutate(() => repository.deleteWearLog(id)),
    }),
    [
      createItem,
      createOutfit,
      updateOutfit,
      data,
      error,
      loading,
      loadReplacementLines,
      loadReplacementLegacyLinks,
      reviewReplacementLegacyLink,
      findMatchingOutfits,
      mutate,
      refresh,
      repository,
      setOutfitArchived,
      updateItem,
      updateOutfitItemPlacement,
      replaceOutfitPreview,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useClosetData() {
  const value = useContext(DataContext)
  if (!value) throw new Error('DataProvider가 필요합니다.')
  return value
}
