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
import type { ClosetDataProviderRepository } from '../data/repository'
import type { AppData } from '../lib/types'
import { ImageAssetsProvider } from './ImageAssetsContext'
import {
  type ClosetActions,
  useClosetActionsValue,
} from './use-closet-actions'

interface ClosetDataState {
  data: AppData | null
  loading: boolean
  error: string | null
}

type ClosetDataValue = ClosetDataState & ClosetActions

const ClosetDataStateContext = createContext<ClosetDataState | null>(null)
const ClosetActionsContext = createContext<ClosetActions | null>(null)

export function DataProvider({
  repository,
  children,
}: PropsWithChildren<{ repository: ClosetDataProviderRepository }>) {
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

  const actionsValue = useClosetActionsValue({
    repository,
    refresh,
    setData,
    setError,
  })

  const stateValue = useMemo<ClosetDataState>(
    () => ({ data, loading, error }),
    [data, error, loading],
  )

  return (
    <ClosetActionsContext.Provider value={actionsValue}>
      <ClosetDataStateContext.Provider value={stateValue}>
        <ImageAssetsProvider repository={repository}>
          {children}
        </ImageAssetsProvider>
      </ClosetDataStateContext.Provider>
    </ClosetActionsContext.Provider>
  )
}

export function useClosetDataState() {
  const value = useContext(ClosetDataStateContext)
  if (!value) throw new Error('DataProvider가 필요합니다.')
  return value
}

export function useClosetActions() {
  const value = useContext(ClosetActionsContext)
  if (!value) throw new Error('DataProvider가 필요합니다.')
  return value
}

export function useClosetData() {
  const state = useClosetDataState()
  const actions = useClosetActions()

  return useMemo<ClosetDataValue>(
    () => ({ ...state, ...actions }),
    [actions, state],
  )
}
