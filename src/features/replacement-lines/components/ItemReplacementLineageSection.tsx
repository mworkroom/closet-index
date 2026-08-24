import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ItemVisual } from '../../../components/ItemVisual'
import { ErrorState, LoadingState } from '../../../components/States'
import { useClosetActions } from '../../../context/DataContext'
import type { Item, ReplacementLineEdge } from '../../../lib/types'
import {
  getItemReplacementLineage,
  type ItemReplacementLineRelation,
} from '../item-replacement-lineage'

function RelatedItemCard({
  item,
  role,
}: {
  item: Item
  role: '이전 Item' | '다음 Item'
}) {
  return (
    <Link
      className="item-detail-lineage__item"
      to={`/closet/${item.id}`}
      aria-label={`${item.name} Item 상세 보기`}
    >
      <ItemVisual item={item} className="item-visual--detail-lineage" />
      <span className="item-detail-lineage__item-copy">
        <small>{role}</small>
        <strong>{item.name}</strong>
        {item.retired ? <span>Retired</span> : null}
      </span>
    </Link>
  )
}

function CurrentItemCard({
  item,
  isStart,
  showInheritanceBadge,
}: {
  item: Item
  isStart: boolean
  showInheritanceBadge: boolean
}) {
  return (
    <div
      className="item-detail-lineage__item item-detail-lineage__item--current"
      aria-label={`현재 Item ${item.name}`}
    >
      <ItemVisual item={item} className="item-visual--detail-lineage" />
      <span className="item-detail-lineage__item-copy">
        <small>현재 Item</small>
        <strong>{item.name}</strong>
        {isStart ? <span>시작 Item</span> : null}
        {showInheritanceBadge ? (
          <span className="item-detail-lineage__inheritance-badge" aria-label="계승">
            계승 👑
          </span>
        ) : null}
      </span>
    </div>
  )
}

function RelationGroup({
  relations,
  role,
}: {
  relations: ItemReplacementLineRelation[]
  role: '이전 Item' | '다음 Item'
}) {
  return (
    <div className="item-detail-lineage__group" aria-label={`${role} 목록`}>
      {relations.map((relation) => (
        <RelatedItemCard
          item={relation.item}
          role={role}
          key={relation.edgeId}
        />
      ))}
    </div>
  )
}

export function ItemReplacementLineageSection({
  item,
  items,
}: {
  item: Item
  items: Item[]
}) {
  const { replacementLines } = useClosetActions()
  const [edges, setEdges] = useState<ReplacementLineEdge[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setEdges(null)
    setError(null)

    void replacementLines.loadEdges().then(
      (nextEdges) => {
        if (active) setEdges(nextEdges)
      },
      (cause) => {
        if (!active) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Replacement Line을 불러오지 못했습니다.',
        )
      },
    )

    return () => {
      active = false
    }
  }, [item.id, loadAttempt, replacementLines])

  const lineage = edges
    ? getItemReplacementLineage(item.id, items, edges)
    : null
  const hasRelations = Boolean(
    lineage && (lineage.parents.length > 0 || lineage.children.length > 0),
  )
  const hasInheritanceBadge = Boolean(
    lineage?.parents.some((relation) => relation.decisionReason === '계승 👑'),
  )

  if (!error && edges && !hasRelations) return null

  return (
    <section
      className="section item-detail-lineage"
      aria-labelledby="item-replacement-line-heading"
    >
      <div className="section-heading">
        <h2 id="item-replacement-line-heading">Replacement Line</h2>
        {hasRelations ? (
          <span className="count">
            이전 {lineage?.parents.length ?? 0} · 다음{' '}
            {lineage?.children.length ?? 0}
          </span>
        ) : null}
      </div>

      {error ? (
        <ErrorState
          title="교체 계보를 불러오지 못했어요"
          message={error}
          onRetry={() => setLoadAttempt((current) => current + 1)}
        />
      ) : !lineage ? (
        <LoadingState label="교체 계보를 불러오는 중" />
      ) : (
        <>
          <div
            className="item-detail-lineage__flow"
            aria-label={`${item.name} 직접 교체 계보`}
          >
            {lineage.parents.length > 0 ? (
              <>
                <RelationGroup relations={lineage.parents} role="이전 Item" />
                <ArrowRight
                  className="item-detail-lineage__arrow"
                  size={20}
                  aria-hidden="true"
                />
              </>
            ) : null}

            <CurrentItemCard
              item={item}
              isStart={lineage.parents.length === 0}
              showInheritanceBadge={hasInheritanceBadge}
            />

            {lineage.children.length > 0 ? (
              <>
                <ArrowRight
                  className="item-detail-lineage__arrow"
                  size={20}
                  aria-hidden="true"
                />
                <RelationGroup relations={lineage.children} role="다음 Item" />
              </>
            ) : null}
          </div>

        </>
      )}
    </section>
  )
}
