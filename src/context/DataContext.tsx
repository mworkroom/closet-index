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
  OutfitItemPositionInput,
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
  updateItemSuitability: (
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) => Promise<void>
  updateOutfitItemPosition: (input: OutfitItemPositionInput) => Promise<void>
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

  const updateOutfitItemPosition = useCallback(
    async (input: OutfitItemPositionInput) => {
      setError(null)
      try {
        await repository.updateOutfitItemPosition(input)
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
                slot: null,
                positionX: input.positionX,
                positionY: input.positionY,
                itemScale: input.itemScale,
                zIndex: null,
              }

              return {
                ...outfit,
                itemPlacements: hasPlacement
                  ? placements.map((placement) =>
                      placement.itemId === input.itemId
                        ? {
                            ...placement,
                            positionX: input.positionX,
                            positionY: input.positionY,
                            itemScale: input.itemScale,
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

  const value = useMemo<DataState>(
    () => ({
      data,
      loading,
      error,
      refresh,
      updateItemSuitability: (itemId, rainOk, longWalkOk) =>
        mutate(() => repository.updateItemSuitability(itemId, rainOk, longWalkOk)),
      updateOutfitItemPosition,
      saveDefaultWeatherLocation: (input) =>
        mutate(() => repository.saveDefaultWeatherLocation(input)),
      fetchWeatherForecast: (input) => repository.fetchWeatherForecast(input),
      createWearLog: (input) => mutate(() => repository.createWearLog(input)),
      updateWearLog: (id, input) => mutate(() => repository.updateWearLog(id, input)),
      deleteWearLog: (id) => mutate(() => repository.deleteWearLog(id)),
    }),
    [data, error, loading, mutate, refresh, repository, updateOutfitItemPosition],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useClosetData() {
  const value = useContext(DataContext)
  if (!value) throw new Error('DataProvider가 필요합니다.')
  return value
}
