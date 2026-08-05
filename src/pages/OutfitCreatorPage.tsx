import { Check, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { OutfitDraftPositionEditor } from '../components/OutfitDraftPositionEditor'
import { OutfitVisual } from '../components/OutfitVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { useSeasonScope } from '../context/SeasonScopeContext'
import {
  getItemCategoryGroupId,
  isItemVisibleInWardrobeSelection,
  ITEM_CATEGORY_FILTER_GROUPS,
  sortItemsForOutfitDisplay,
  type ItemCategoryFilterGroupId,
} from '../lib/item-categories'
import {
  getOutfitItemDisplayMode,
  getOutfitItemDisplayPlacement,
  getOutfitItemPlacementDefaults,
  supportsOutfitItemDisplayMode,
  type OutfitItemDisplayMode,
} from '../lib/outfit-composition'
import { sortItems } from '../lib/items'
import { outfitLabel } from '../lib/outfits'
import {
  itemMatchesSeasonScope,
  SEASONS,
  seasonLabels,
  type Season,
} from '../lib/seasons'
import type {
  Item,
  MatchingOutfit,
  Outfit,
  OutfitItemPlacement,
  OutfitRating,
} from '../lib/types'
import { ratingLabels } from '../lib/types'

interface DraftPlacement {
  displayMode: OutfitItemDisplayMode
  positionX?: number
  positionY?: number
  itemScale?: number
  slot?: string | null
  zIndex?: number | null
}

function buildDraftOutfit(
  id: string,
  displayName: string,
  rating: OutfitRating,
  itemIds: string[],
  items: Item[],
  draftPlacements: Map<string, DraftPlacement>,
): Outfit {
  const selectedItems = itemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is Item => Boolean(item))
  const hasVisibleOuter = selectedItems.some(
    (item) => Boolean(item.image) && item.category.startsWith('Outer'),
  )

  return {
    id,
    displayName: displayName.trim() || null,
    rating,
    archivedAt: null,
    itemIds,
    itemPlacements: selectedItems.map((item) => {
      const draft = draftPlacements.get(item.id)
      const displayMode = draft?.displayMode ?? 'auto'
      const defaults = getOutfitItemPlacementDefaults(
        item,
        hasVisibleOuter,
        displayMode,
      )
      const displayPlacement = supportsOutfitItemDisplayMode(item)
        ? getOutfitItemDisplayPlacement(item, displayMode)
        : {
            slot: draft?.slot ?? null,
            zIndex: draft?.zIndex ?? null,
          }

      return {
        itemId: item.id,
        slot: displayPlacement.slot,
        positionX: draft?.positionX ?? defaults.positionX,
        positionY: draft?.positionY ?? defaults.positionY,
        itemScale: draft?.itemScale ?? defaults.itemScale,
        zIndex: displayPlacement.zIndex,
      }
    }),
  }
}

export function OutfitCreatorPage() {
  const navigate = useNavigate()
  const { outfitId: editOutfitId } = useParams()
  const [searchParams] = useSearchParams()
  const isEditing = Boolean(editOutfitId)
  const sourceOutfitId = editOutfitId ?? searchParams.get('source')
  const {
    data,
    loading,
    error,
    refresh,
    findMatchingOutfits,
    createOutfit,
    updateOutfit,
  } = useClosetData()
  const { activeSeasons } = useSeasonScope()
  const [outfitId] = useState(() => editOutfitId ?? crypto.randomUUID())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [draftPlacements, setDraftPlacements] = useState(
    () => new Map<string, DraftPlacement>(),
  )
  const [displayName, setDisplayName] = useState('')
  const [rating, setRating] = useState<Exclude<OutfitRating, null>>('ok')
  const [query, setQuery] = useState('')
  const [categoryGroup, setCategoryGroup] =
    useState<ItemCategoryFilterGroupId | ''>('')
  const [color, setColor] = useState('')
  const [season, setSeason] = useState<Season | ''>('')
  const [includeRetired, setIncludeRetired] = useState(false)
  const [matches, setMatches] = useState<MatchingOutfit[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sourceApplied, setSourceApplied] = useState(!sourceOutfitId)
  const [sourceError, setSourceError] = useState<string | null>(null)

  const sourceOutfit = sourceOutfitId
    ? data?.outfits.find((outfit) => outfit.id === sourceOutfitId) ?? null
    : null

  useEffect(() => {
    if (!data || sourceApplied || !sourceOutfitId) return
    if (!sourceOutfit) {
      setSourceError(
        isEditing
          ? '수정할 Outfit을 찾을 수 없습니다.'
          : '복제할 원본 Outfit을 찾을 수 없습니다.',
      )
      setSourceApplied(true)
      return
    }

    const placements = new Map<string, DraftPlacement>()
    for (const itemId of sourceOutfit.itemIds) {
      const item = data.items.find((entry) => entry.id === itemId)
      const placement = sourceOutfit.itemPlacements?.find(
        (entry) => entry.itemId === itemId,
      )
      if (!item) continue
      placements.set(itemId, {
        displayMode: getOutfitItemDisplayMode(item, placement),
        positionX: placement?.positionX ?? undefined,
        positionY: placement?.positionY ?? undefined,
        itemScale: placement?.itemScale ?? undefined,
        slot: placement?.slot ?? null,
        zIndex: placement?.zIndex ?? null,
      })
    }

    setSelectedIds([...sourceOutfit.itemIds])
    setDraftPlacements(placements)
    setDisplayName(sourceOutfit.displayName ?? '')
    setRating(isEditing ? sourceOutfit.rating ?? 'ok' : 'ok')
    setSourceApplied(true)
  }, [data, isEditing, sourceApplied, sourceOutfit, sourceOutfitId])

  const colors = useMemo(
    () =>
      [
        ...new Set(
          data?.items
            .map((item) => item.semanticColor)
            .filter((value): value is string => Boolean(value)) ?? [],
        ),
      ].sort(),
    [data],
  )

  const availableItems = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLocaleLowerCase('ko')
    const seasonScope = season ? [season] : activeSeasons

    return sortItems(
      data.items.filter((item) => {
        if (!isItemVisibleInWardrobeSelection(item)) return false
        if (!includeRetired && item.retired) return false
        if (
          categoryGroup &&
          getItemCategoryGroupId(item.category) !== categoryGroup
        ) {
          return false
        }
        if (color && item.semanticColor !== color) return false
        if (!itemMatchesSeasonScope(item, seasonScope)) return false
        return (
          !normalized ||
          item.name.toLocaleLowerCase('ko').includes(normalized) ||
          item.category.toLocaleLowerCase('ko').includes(normalized)
        )
      }),
      'acquired-desc',
    )
  }, [
    activeSeasons,
    categoryGroup,
    color,
    data,
    includeRetired,
    query,
    season,
  ])

  const selectedItems = useMemo(
    () =>
      sortItemsForOutfitDisplay(
        selectedIds
          .map((itemId) => data?.items.find((item) => item.id === itemId))
          .filter((item): item is Item => Boolean(item)),
      ),
    [data, selectedIds],
  )

  const draftOutfit = useMemo(
    () =>
      buildDraftOutfit(
        outfitId,
        displayName,
        rating,
        selectedIds,
        data?.items ?? [],
        draftPlacements,
      ),
    [data, displayName, draftPlacements, outfitId, rating, selectedIds],
  )

  const resetDuplicateCheck = () => {
    setMatches([])
    setSaveError(null)
  }

  const toggleItem = (itemId: string) => {
    resetDuplicateCheck()
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    )
    setDraftPlacements((current) => {
      if (!current.has(itemId)) return current
      const next = new Map(current)
      next.delete(itemId)
      return next
    })
  }

  const updatePlacement = (
    placement: OutfitItemPlacement,
    displayMode: OutfitItemDisplayMode,
  ) => {
    resetDuplicateCheck()
    setDraftPlacements((current) => {
      const next = new Map(current)
      next.set(placement.itemId, {
        displayMode,
        positionX: placement.positionX ?? undefined,
        positionY: placement.positionY ?? undefined,
        itemScale: placement.itemScale ?? undefined,
        slot: placement.slot,
        zIndex: placement.zIndex,
      })
      return next
    })
  }

  const save = async (allowDuplicate: boolean) => {
    if (saving || selectedIds.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      if (!allowDuplicate) {
        const duplicateOutfits = (await findMatchingOutfits(selectedIds)).filter(
          (outfit) => outfit.id !== editOutfitId,
        )
        if (duplicateOutfits.length > 0) {
          setMatches(duplicateOutfits)
          return
        }
      }

      const items = selectedIds.map((itemId, index) => {
        const placement = draftOutfit.itemPlacements?.find(
          (entry) => entry.itemId === itemId,
        )
        return {
          itemId,
          sortOrder: index,
          slot: placement?.slot ?? null,
          positionX: placement?.positionX ?? null,
          positionY: placement?.positionY ?? null,
          itemScale: placement?.itemScale ?? null,
          zIndex: placement?.zIndex ?? null,
        }
      })
      const saved =
        isEditing && editOutfitId
          ? await updateOutfit(editOutfitId, {
              displayName: displayName.trim() || null,
              rating,
              allowDuplicate,
              items,
            })
          : await createOutfit({
              id: outfitId,
              displayName: displayName.trim() || null,
              allowDuplicate,
              items,
            })
      navigate(`/outfits/${saved.id}`, {
        replace: true,
      })
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Outfit을 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const imageCount = selectedItems.filter((item) => Boolean(item.image)).length

  return (
    <AppShell
      title={isEditing ? '착장 수정' : '새 Outfit'}
      eyebrow={isEditing ? 'EDIT OUTFIT' : 'CREATE OUTFIT'}
      back
      hideNavigation
    >
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && (
        <>
          {!isEditing && sourceOutfit && sourceApplied && (
            <section className="outfit-creator__source" role="status">
              <span>
                <strong>원본 Outfit에서 복제 중</strong>
                <small>
                  Item과 배치만 초깃값으로 복사했습니다. 원본의 평가와 착용
                  기록은 바뀌지 않습니다.
                </small>
              </span>
              <Link to={`/outfits/${sourceOutfit.id}`}>
                {outfitLabel(sourceOutfit, data.items)} 보기
              </Link>
            </section>
          )}
          {sourceError && (
            <p className="form-error" role="alert">
              {sourceError}
            </p>
          )}
          <section className="section outfit-creator__selected">
            <div className="section-heading">
              <h2>현재 선택</h2>
              <span className="count">{selectedItems.length}개</span>
            </div>
            {selectedItems.length === 0 ? (
              <p className="outfit-creator__empty-selection">
                아래에서 Item을 골라 착장을 구성해 주세요.
              </p>
            ) : (
              <div className="outfit-creator__selected-list">
                {selectedItems.map((item) => (
                  <div className="outfit-creator__selected-item" key={item.id}>
                    <ItemVisual item={item} className="item-visual--row" />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.category}</small>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${item.name} 선택 해제`}
                      onClick={() => toggleItem(item.id)}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {selectedItems.length > 0 && (
            <section className="section outfit-creator__preview-section">
              <div className="section-heading">
                <h2>실시간 미리보기</h2>
                <span className="count">
                  이미지 {imageCount} · 없음 {selectedItems.length - imageCount}
                </span>
              </div>
              <OutfitVisual
                outfit={draftOutfit}
                items={data.items}
                className="outfit-creator__preview"
              />
            </section>
          )}

          <section className="filter-panel outfit-creator__filters">
            <div className="section-heading">
              <h2>Item 추가</h2>
              <span className="count">{availableItems.length}개</span>
            </div>
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">아이템 검색</span>
              <input
                type="search"
                value={query}
                placeholder="이름 또는 상세 카테고리 검색"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div
              className="outfit-creator__category-tabs"
              aria-label="카테고리"
            >
              <button
                type="button"
                aria-pressed={categoryGroup === ''}
                onClick={() => setCategoryGroup('')}
              >
                전체
              </button>
              {ITEM_CATEGORY_FILTER_GROUPS.map((group) => (
                <button
                  type="button"
                  aria-pressed={categoryGroup === group.id}
                  onClick={() => setCategoryGroup(group.id)}
                  key={group.id}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="filter-row">
              <select
                aria-label="색상"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              >
                <option value="">모든 색상</option>
                {colors.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <select
                aria-label="계절"
                value={season}
                onChange={(event) => setSeason(event.target.value as Season | '')}
              >
                <option value="">현재 계절 범위</option>
                {SEASONS.map((value) => (
                  <option value={value} key={value}>
                    {seasonLabels[value]}
                  </option>
                ))}
              </select>
              <label className="check-row outfit-creator__retired-toggle">
                <input
                  type="checkbox"
                  checked={includeRetired}
                  onChange={(event) => setIncludeRetired(event.target.checked)}
                />
                Retired 포함
              </label>
            </div>
          </section>

          <section className="section">
            {availableItems.length === 0 ? (
              <EmptyState title="필터에 맞는 Item이 없어요" />
            ) : (
              <div className="outfit-creator__item-grid">
                {availableItems.map((item) => {
                  const selected = selectedIds.includes(item.id)
                  return (
                    <button
                      type="button"
                      className="outfit-creator__item-card"
                      aria-pressed={selected}
                      aria-label={`${item.name} ${selected ? '선택 해제' : '추가'}`}
                      onClick={() => toggleItem(item.id)}
                      key={item.id}
                    >
                      <ItemVisual item={item} className="item-visual--grid" />
                      <span className="outfit-creator__item-card-copy">
                        <strong>{item.name}</strong>
                        <small>{item.category}</small>
                      </span>
                      <span className="outfit-creator__item-card-state">
                        {selected ? (
                          <Check size={16} aria-hidden="true" />
                        ) : (
                          <Plus size={16} aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {draftOutfit.itemIds.length > 0 && imageCount > 0 && (
            <OutfitDraftPositionEditor
              outfit={draftOutfit}
              items={data.items}
              onChange={updatePlacement}
            />
          )}

          <section className="section outfit-creator__review">
            <div className="section-heading">
              <div>
                <p className="eyebrow">REVIEW</p>
                <h2>이름과 저장 검토</h2>
              </div>
              <span className="count">
                평가 {ratingLabels[rating]}
              </span>
            </div>
            {isEditing && (
              <fieldset className="field">
                <legend>평가</legend>
                <div className="segmented segmented--four">
                  {([
                    ['favorite', 'Favorite'],
                    ['ok', 'OK'],
                    ['error', 'Error'],
                  ] as const).map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="outfit-rating"
                        value={value}
                        checked={rating === value}
                        onChange={() => setRating(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="field">
              <span>Outfit 이름 (선택)</span>
              <input
                type="text"
                value={displayName}
                maxLength={120}
                placeholder="예: 가볍게 걷는 날"
                onChange={(event) => {
                  setDisplayName(event.target.value)
                  resetDuplicateCheck()
                }}
              />
            </label>
            <dl className="outfit-creator__review-counts">
              <div>
                <dt>선택 Item</dt>
                <dd>{selectedItems.length}개</dd>
              </div>
              <div>
                <dt>이미지 있음</dt>
                <dd>{imageCount}개</dd>
              </div>
              <div>
                <dt>이미지 없음</dt>
                <dd>{selectedItems.length - imageCount}개</dd>
              </div>
            </dl>

            {matches.length > 0 && (
              <div className="outfit-creator__duplicate-warning" role="alert">
                <strong>같은 Item 조합의 Outfit이 이미 있습니다.</strong>
                <p>기존 착장을 확인한 뒤 정말 별도로 필요할 때만 저장해 주세요.</p>
                <div>
                  {matches.map((match) => (
                    <Link to={`/outfits/${match.id}`} key={match.id}>
                      {match.displayName || '이름 없는 Outfit'}
                      {match.archivedAt ? ' · 보관됨' : ''}
                    </Link>
                  ))}
                </div>
                <button
                  type="button"
                  className="button button--secondary button--wide"
                  disabled={saving}
                  onClick={() => void save(true)}
                >
                  {saving
                    ? '저장 중…'
                    : isEditing
                      ? '같은 조합으로 수정'
                      : '같은 조합으로 별도 저장'}
                </button>
              </div>
            )}

            {saveError && (
              <p className="form-error" role="alert">
                {saveError}
              </p>
            )}
            <button
              type="button"
              className="button button--primary button--wide"
              disabled={selectedItems.length === 0 || saving || matches.length > 0}
              onClick={() => void save(false)}
            >
              {saving
                ? isEditing
                  ? '변경 저장 중…'
                  : 'Outfit 저장 중…'
                : isEditing
                  ? '변경 저장'
                  : '새 Outfit 저장'}
            </button>
            <p className="outfit-creator__save-note">
              {isEditing
                ? '이름, 구성 Item, 평가를 수정합니다. 보관 상태와 Wear Log는 유지됩니다.'
                : '저장할 때 새 Outfit과 모든 Item 관계를 한 번에 생성합니다. Wear Log는 자동으로 만들지 않습니다.'}
            </p>
          </section>
        </>
      )}
    </AppShell>
  )
}
