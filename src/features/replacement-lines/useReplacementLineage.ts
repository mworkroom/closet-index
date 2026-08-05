import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClosetData } from '../../context/DataContext'
import type {
  ReplacementLineArchiveInput,
  ReplacementLineColorUpdateInput,
  ReplacementLineDeleteInput,
  ReplacementLineDetailsUpdateInput,
  ReplacementLineEdge,
  ReplacementLineEdgeConnectionUpdateInput,
  ReplacementLineEdgeDirectionUpdateInput,
  ReplacementLineItemAddInput,
  ReplacementLineItemMoveInput,
  ReplacementLineItemRemoveInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineMergeInput,
  ReplacementLineReviewInput,
  ReplacementLineSnapshot,
  ReplacementLineStart,
} from '../../lib/types'
import {
  applyAddedReplacementLineItem,
  applyRemovedReplacementLineItem,
  replaceReplacementLine,
} from './replacement-line-snapshot'

export function useReplacementLineage(lineId: string) {
  const navigate = useNavigate()
  const { data, replacementLines } = useClosetData()
  const [snapshot, setSnapshot] = useState<ReplacementLineSnapshot | null>(null)
  const [edges, setEdges] = useState<ReplacementLineEdge[] | null>(null)
  const [starts, setStarts] = useState<ReplacementLineStart[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSnapshot, nextEdges, nextStarts] = await Promise.all([
        replacementLines.load(),
        replacementLines.loadEdges(),
        replacementLines.loadStarts(),
      ])
      setSnapshot(nextSnapshot)
      setEdges(nextEdges)
      setStarts(nextStarts)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Lineage를 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [lineId, replacementLines])

  useEffect(() => {
    void reload()
  }, [reload])

  const updateEdge = useCallback(
    async (edgeId: string, input: ReplacementLineEdgeConnectionUpdateInput) => {
      const updatedEdge = await replacementLines.updateEdgeConnection(edgeId, input)
      setEdges((current) =>
        current?.map((edge) => (edge.id === updatedEdge.id ? updatedEdge : edge)) ??
        current,
      )
    },
    [replacementLines],
  )

  const disconnectEdge = useCallback(
    async (edge: ReplacementLineEdge) => {
      const isStart = await replacementLines.disconnectEdge(edge.id, {
        expectedUpdatedAt: edge.updatedAt,
      })
      setEdges((current) => current?.filter((entry) => entry.id !== edge.id) ?? current)
      if (isStart) {
        setStarts((current) => {
          const withoutItem =
            current?.filter(
              (start) =>
                start.replacementLineId !== edge.replacementLineId ||
                start.itemId !== edge.successorItemId,
            ) ?? []
          return [
            ...withoutItem,
            {
              replacementLineId: edge.replacementLineId,
              itemId: edge.successorItemId,
              designatedAt: new Date().toISOString(),
            },
          ]
        })
      }
    },
    [replacementLines],
  )

  const reverseEdge = useCallback(
    async (edgeId: string, input: ReplacementLineEdgeDirectionUpdateInput) => {
      const updatedEdge = await replacementLines.reverseEdge(edgeId, input)
      setEdges((current) =>
        current?.map((edge) => (edge.id === updatedEdge.id ? updatedEdge : edge)) ??
        current,
      )
    },
    [replacementLines],
  )

  const setStart = useCallback(
    async (itemId: string, isStart: boolean) => {
      const savedState = await replacementLines.setStart(lineId, itemId, isStart)
      setStarts((current) => {
        const withoutItem =
          current?.filter(
            (start) =>
              start.replacementLineId !== lineId || start.itemId !== itemId,
          ) ?? []
        return savedState
          ? [
              ...withoutItem,
              {
                replacementLineId: lineId,
                itemId,
                designatedAt: new Date().toISOString(),
              },
            ]
          : withoutItem
      })
    },
    [lineId, replacementLines],
  )

  const createManualEdge = useCallback(
    async (input: ReplacementLineManualEdgeInput) => {
      const createdEdge = await replacementLines.createManualEdge(input)
      setEdges((current) => (current ? [...current, createdEdge] : [createdEdge]))
    },
    [replacementLines],
  )

  const moveItem = useCallback(
    async (input: ReplacementLineItemMoveInput) => {
      const targetLine = await replacementLines.moveItem(input)
      navigate(`/replacement-lines/${targetLine.id}`)
    },
    [navigate, replacementLines],
  )

  const addItem = useCallback(
    async (input: ReplacementLineItemAddInput) => {
      const savedLine = await replacementLines.addItem(input)
      setSnapshot((current) =>
        current ? applyAddedReplacementLineItem(current, input, savedLine) : current,
      )
      setStarts((current) => [
        ...(current?.filter((start) => start.itemId !== input.itemId) ?? []),
        {
          replacementLineId: savedLine.id,
          itemId: input.itemId,
          designatedAt: new Date().toISOString(),
        },
      ])
    },
    [replacementLines],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      const sourceLine = snapshot?.lines.find((line) => line.id === lineId)
      if (!sourceLine) throw new Error('현재 Replacement Line을 찾지 못했습니다.')
      const input: ReplacementLineItemRemoveInput = {
        sourceLineId: sourceLine.id,
        itemId,
        expectedSourceUpdatedAt: sourceLine.updatedAt,
      }
      const savedLines = await replacementLines.removeItem(input)
      setSnapshot((current) =>
        current
          ? applyRemovedReplacementLineItem(current, input, savedLines)
          : current,
      )
      setStarts((current) =>
        current?.filter(
          (start) =>
            start.replacementLineId !== sourceLine.id || start.itemId !== itemId,
        ) ?? current,
      )
    },
    [lineId, replacementLines, snapshot],
  )

  const mergeLines = useCallback(
    async (input: ReplacementLineMergeInput) => {
      const targetLine = await replacementLines.mergeLines(input)
      navigate(`/replacement-lines/${targetLine.id}`)
    },
    [navigate, replacementLines],
  )

  const setLineArchived = useCallback(
    async (input: ReplacementLineArchiveInput) => {
      const savedLine = await replacementLines.setArchived(input)
      setSnapshot((current) =>
        current ? replaceReplacementLine(current, savedLine) : current,
      )
    },
    [replacementLines],
  )

  const setLineColorCategory = useCallback(
    async (input: ReplacementLineColorUpdateInput) => {
      const savedLine = await replacementLines.setColorCategory(input)
      setSnapshot((current) =>
        current ? replaceReplacementLine(current, savedLine) : current,
      )
    },
    [replacementLines],
  )

  const acknowledgeLineReview = useCallback(
    async (input: ReplacementLineReviewInput) => {
      const savedLine = await replacementLines.acknowledgeReview(input)
      setSnapshot((current) =>
        current ? replaceReplacementLine(current, savedLine) : current,
      )
    },
    [replacementLines],
  )

  const updateLineDetails = useCallback(
    async (input: ReplacementLineDetailsUpdateInput) => {
      const savedLine = await replacementLines.updateDetails(input)
      setSnapshot((current) =>
        current ? replaceReplacementLine(current, savedLine) : current,
      )
    },
    [replacementLines],
  )

  const deleteLine = useCallback(
    async (input: ReplacementLineDeleteInput) => {
      const deleted = await replacementLines.deleteEmpty(input)
      if (!deleted) throw new Error('빈 Replacement Line 삭제 결과를 확인하지 못했습니다.')
      navigate('/replacement-lines')
    },
    [navigate, replacementLines],
  )

  return {
    data,
    snapshot,
    edges,
    starts,
    loading,
    error,
    reload,
    updateEdge,
    disconnectEdge,
    reverseEdge,
    setStart,
    createManualEdge,
    moveItem,
    addItem,
    removeItem,
    mergeLines,
    setLineArchived,
    setLineColorCategory,
    acknowledgeLineReview,
    updateLineDetails,
    deleteLine,
  }
}
