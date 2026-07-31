import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getOutfitItemDisplayMode,
  getOutfitItemDisplayPlacement,
  getOutfitItemPlacementDefaults,
  supportsOutfitItemDisplayMode,
  type OutfitItemDisplayMode,
} from '../lib/outfit-composition'
import type { Item, Outfit, OutfitItemPlacement } from '../lib/types'
import { ItemVisual } from './ItemVisual'
import { LayeredOutfitPreview } from './LayeredOutfitPreview'

const STEP = 4
const SCALE_STEP = 0.05
const MIN_SCALE = 0.5
const MAX_SCALE = 1.5

interface OutfitDraftPositionEditorProps {
  outfit: Outfit
  items: Item[]
  onChange: (
    placement: OutfitItemPlacement,
    displayMode: OutfitItemDisplayMode,
  ) => void
}

function hasVisibleOuter(items: Item[]) {
  return items.some(
    (item) => Boolean(item.image) && item.category.startsWith('Outer'),
  )
}

export function OutfitDraftPositionEditor({
  outfit,
  items,
  onChange,
}: OutfitDraftPositionEditorProps) {
  const editableItems = useMemo(
    () =>
      outfit.itemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter((item): item is Item => Boolean(item?.image)),
    [items, outfit.itemIds],
  )
  const [selectedId, setSelectedId] = useState(editableItems[0]?.id ?? '')

  useEffect(() => {
    if (!editableItems.some((item) => item.id === selectedId)) {
      setSelectedId(editableItems[0]?.id ?? '')
    }
  }, [editableItems, selectedId])

  const selectedItem = editableItems.find((item) => item.id === selectedId)
  if (!selectedItem) return null

  const hasOuter = hasVisibleOuter(editableItems)
  const storedPlacement = outfit.itemPlacements?.find(
    (entry) => entry.itemId === selectedItem.id,
  )
  const displayMode = getOutfitItemDisplayMode(selectedItem, storedPlacement)
  const defaults = getOutfitItemPlacementDefaults(
    selectedItem,
    hasOuter,
    displayMode,
  )
  const position = {
    x: storedPlacement?.positionX ?? defaults.positionX,
    y: storedPlacement?.positionY ?? defaults.positionY,
    scale: storedPlacement?.itemScale ?? defaults.itemScale,
  }

  const commit = (
    next: typeof position,
    nextDisplayMode = displayMode,
  ) => {
    const displayPlacement = supportsOutfitItemDisplayMode(selectedItem)
      ? getOutfitItemDisplayPlacement(selectedItem, nextDisplayMode)
      : {
          slot: storedPlacement?.slot ?? null,
          zIndex: storedPlacement?.zIndex ?? null,
        }
    onChange(
      {
        itemId: selectedItem.id,
        slot: displayPlacement.slot,
        positionX: next.x,
        positionY: next.y,
        itemScale: next.scale,
        zIndex: displayPlacement.zIndex,
      },
      nextDisplayMode,
    )
  }

  const resize = (delta: number) => {
    commit({
      ...position,
      scale: Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, Number((position.scale + delta).toFixed(2))),
      ),
    })
  }

  const changeDisplayMode = (nextDisplayMode: OutfitItemDisplayMode) => {
    const nextDefaults = getOutfitItemPlacementDefaults(
      selectedItem,
      hasOuter,
      nextDisplayMode,
    )
    commit(
      {
        x: nextDefaults.positionX,
        y: nextDefaults.positionY,
        scale: nextDefaults.itemScale,
      },
      nextDisplayMode,
    )
  }

  return (
    <section className="section position-editor outfit-creator__position-editor">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PLACEMENT</p>
          <h2>Item별 배치 조정</h2>
        </div>
        <span className="count">위치 4px · 크기 5%</span>
      </div>
      <p className="position-editor__note">
        변경 내용은 이 새 Outfit에만 적용됩니다. 별도의 중간 저장 없이 마지막에
        한 번에 저장됩니다.
      </p>

      <LayeredOutfitPreview
        outfit={outfit}
        items={items}
        className="position-editor__preview"
      />

      <div className="position-editor__controls">
        <strong>{selectedItem.name}</strong>
        <span className="position-editor__coordinates" aria-live="polite">
          좌우 {position.x}px · 상하 {position.y}px · 크기{' '}
          {Math.round(position.scale * 100)}%
        </span>
        <div className="position-editor__control-pad">
          <button
            type="button"
            className="icon-button position-editor__resize"
            aria-label={`${selectedItem.name} 5% 축소`}
            disabled={position.scale <= MIN_SCALE}
            onClick={() => resize(-SCALE_STEP)}
          >
            <Minus size={26} aria-hidden="true" />
          </button>
          <div className="position-editor__arrows">
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 위로 4px 이동`}
              onClick={() => commit({ ...position, y: position.y - STEP })}
            >
              <ArrowUp size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 왼쪽으로 4px 이동`}
              onClick={() => commit({ ...position, x: position.x - STEP })}
            >
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button position-editor__reset"
              aria-label={`${selectedItem.name} 원위치와 원래 크기`}
              onClick={() =>
                commit({
                  x: defaults.positionX,
                  y: defaults.positionY,
                  scale: defaults.itemScale,
                })
              }
            >
              <RotateCcw size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 오른쪽으로 4px 이동`}
              onClick={() => commit({ ...position, x: position.x + STEP })}
            >
              <ArrowRight size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 아래로 4px 이동`}
              onClick={() => commit({ ...position, y: position.y + STEP })}
            >
              <ArrowDown size={22} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="icon-button position-editor__resize"
            aria-label={`${selectedItem.name} 5% 확대`}
            disabled={position.scale >= MAX_SCALE}
            onClick={() => resize(SCALE_STEP)}
          >
            <Plus size={26} aria-hidden="true" />
          </button>
        </div>
        {supportsOutfitItemDisplayMode(selectedItem) && (
          <fieldset className="position-editor__display-modes">
            <legend>표시 방식</legend>
            {(
              [
                ['auto', '자동'],
                ['inside', '아우터 안'],
                ['side', '옆에 분리'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`draft-display-mode-${selectedItem.id}`}
                  value={value}
                  checked={displayMode === value}
                  onChange={() => changeDisplayMode(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>

      <div className="position-editor__items" aria-label="조정할 아이템 선택">
        {editableItems.map((item) => (
          <button
            type="button"
            className="position-editor__item"
            aria-pressed={item.id === selectedId}
            onClick={() => setSelectedId(item.id)}
            key={item.id}
          >
            <ItemVisual item={item} className="item-visual--position" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
