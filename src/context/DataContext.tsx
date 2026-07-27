import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { AppData, WearLogInput } from '../lib/types'
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

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await repository.load())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
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

  const value = useMemo<DataState>(
    () => ({
      data,
      loading,
      error,
      refresh,
      updateItemSuitability: (itemId, rainOk, longWalkOk) =>
        mutate(() => repository.updateItemSuitability(itemId, rainOk, longWalkOk)),
      createWearLog: (input) => mutate(() => repository.createWearLog(input)),
      updateWearLog: (id, input) => mutate(() => repository.updateWearLog(id, input)),
      deleteWearLog: (id) => mutate(() => repository.deleteWearLog(id)),
    }),
    [data, error, loading, mutate, refresh, repository],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useClosetData() {
  const value = useContext(DataContext)
  if (!value) throw new Error('DataProvider가 필요합니다.')
  return value
}
