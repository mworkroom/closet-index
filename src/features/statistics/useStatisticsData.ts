import { useMemo } from 'react'
import { useClosetData } from '../../context/DataContext'
import {
  calculateStatistics,
  selectStatisticsSnapshot,
  type StatisticsFilters,
} from './statistics-calculations'

export function useStatisticsData(filters: StatisticsFilters) {
  const { data, loading, error, refresh } = useClosetData()
  const snapshot = useMemo(
    () => (data ? selectStatisticsSnapshot(data) : null),
    [data],
  )
  const statistics = useMemo(
    () => (snapshot ? calculateStatistics(snapshot, filters) : null),
    [filters, snapshot],
  )

  return { snapshot, statistics, loading, error, refresh }
}
