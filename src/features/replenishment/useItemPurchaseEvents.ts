import { useCallback, useEffect, useRef, useState } from 'react'
import type { PurchaseRepository } from '../../data/purchase-repository'
import type { PurchaseEvent } from '../../lib/types'

export function useItemPurchaseEvents(
  purchases: PurchaseRepository,
  itemId: string,
) {
  const [events, setEvents] = useState<PurchaseEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadSequence = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError(null)
    try {
      const nextEvents = await purchases.load(itemId)
      if (sequence === loadSequence.current) setEvents(nextEvents)
    } catch (cause) {
      if (sequence === loadSequence.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : '재구매 이력을 불러오지 못했습니다.',
        )
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [itemId, purchases])

  useEffect(() => {
    setEvents([])
    void reload()
  }, [reload])

  return { events, loading, error, reload }
}
