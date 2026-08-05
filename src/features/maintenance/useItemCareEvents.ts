import { useCallback, useEffect, useRef, useState } from 'react'
import type { CareRepository } from '../../data/care-repository'
import type { CareEvent } from '../../lib/types'

export function useItemCareEvents(care: CareRepository, itemId: string) {
  const [events, setEvents] = useState<CareEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadSequence = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError(null)
    try {
      const nextEvents = await care.load(itemId)
      if (sequence === loadSequence.current) setEvents(nextEvents)
    } catch (cause) {
      if (sequence === loadSequence.current) {
        setError(cause instanceof Error ? cause.message : '관리 이력을 불러오지 못했습니다.')
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [care, itemId])

  useEffect(() => {
    setEvents([])
    void reload()
  }, [reload])

  return { events, loading, error, reload }
}
