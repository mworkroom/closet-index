import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CareRepository } from '../../data/care-repository'
import type { PurchaseRepository } from '../../data/purchase-repository'
import type { CareEvent, PurchaseEvent } from '../../lib/types'

export function useMaintenanceEvents(
  purchases: PurchaseRepository,
  care: CareRepository,
  itemIds: readonly string[],
) {
  const itemIdKey = useMemo(() => [...new Set(itemIds)].sort().join('\n'), [itemIds])
  const [purchaseEvents, setPurchaseEvents] = useState<PurchaseEvent[]>([])
  const [careEvents, setCareEvents] = useState<CareEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadSequence = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current
    const nextItemIds = itemIdKey ? itemIdKey.split('\n') : []
    setLoading(true)
    setError(null)
    try {
      const [nextPurchases, nextCare] = await Promise.all([
        purchases.loadForItems(nextItemIds),
        care.loadForItems(nextItemIds),
      ])
      if (sequence === loadSequence.current) {
        setPurchaseEvents(nextPurchases)
        setCareEvents(nextCare)
      }
    } catch (cause) {
      if (sequence === loadSequence.current) {
        setPurchaseEvents([])
        setCareEvents([])
        setError(cause instanceof Error ? cause.message : '관리 사건을 불러오지 못했습니다.')
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [care, itemIdKey, purchases])

  useEffect(() => {
    void reload()
  }, [reload])

  return { purchaseEvents, careEvents, loading, error, reload }
}
