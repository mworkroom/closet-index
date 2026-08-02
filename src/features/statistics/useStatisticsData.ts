import { useMemo } from 'react'
import { useClosetData } from '../../context/DataContext'
import {
  calculateStatistics,
  selectStatisticsSnapshot,
} from './statistics-calculations'

export function useStatisticsData() {
  const { data, loading, error, refresh } = useClosetData()
  const snapshot = useMemo(
    () => (data ? selectStatisticsSnapshot(data) : null),
    [data],
  )
  const statistics = useMemo(
    () => (snapshot ? calculateStatistics(snapshot) : null),
    [snapshot],
  )

  return { snapshot, statistics, loading, error, refresh }
}
