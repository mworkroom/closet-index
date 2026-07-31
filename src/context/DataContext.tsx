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
  OutfitItemPlacementInput,
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
  createItem: (input: ItemCreateInput) => Promise<Item>
  updateItem: (itemId: string, input: ItemWriteInput) => Promise<Item>
  replaceItemImage: (
    itemId: string,
    input: ItemImageUploadInput,
  ) => Promise<void>
  setItemRetired: (itemId: string, retired: boolean) => Promise<void>
  updateItemSuitability: (
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) => Promise<void>
  updateOutfitItemPlacement: (input: OutfitItemPlacementInput) => Promise<void>
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
      createItem,
      updateItem,
      replaceItemImage: (itemId, input) =>
        mutate(() => repository.replaceItemImage(itemId, input)),
      setItemRetired: (itemId, retired) =>
        mutate(() => repository.setItemRetired(itemId, retired)),
      updateItemSuitability: (itemId, rainOk, longWalkOk) =>
        mutate(() => repository.updateItemSuitability(itemId, rainOk, longWalkOk)),
      updateOutfitItemPlacement,
      saveDefaultWeatherLocation: (input) =>
        mutate(() => repository.saveDefaultWeatherLocation(input)),
      fetchWeatherForecast: (input) => repository.fetchWeatherForecast(input),
      createWearLog: (input) => mutate(() => repository.createWearLog(input)),
      updateWearLog: (id, input) => mutate(() => repository.updateWearLog(id, input)),
      deleteWearLog: (id) => mutate(() => repository.deleteWearLog(id)),
    }),
    [
      createItem,
      data,
      error,
      loading,
      mutate,
      refresh,
      repository,
      updateItem,
      updateOutfitItemPlacement,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useClosetData() {
  const value = useContext(DataContext)
  if (!value) throw new Error('DataProvider가 필요합니다.')
  return value
}
