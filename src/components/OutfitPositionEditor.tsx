import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  Item,
  Outfit,
  OutfitItemPositionInput,
} from '../lib/types'
import { ItemVisual } from './ItemVisual'
import { LayeredOutfitPreview } from './LayeredOutfitPreview'

const STEP = 4

interface Position {
  x: number
  y: number
}

interface OutfitPositionEditorProps {
  outfit: Outfit
  items: Item[]
  onSave: (input: OutfitItemPositionInput) => Promise<void>
}

function positionsFrom(outfit: Outfit) {
  return new Map(
    outfit.itemIds.map((itemId) => {
      const placement = outfit.itemPlacements?.find(
        (entry) => entry.itemId === itemId,
      )
      return [
        itemId,
        {
          x: placement?.positionX ?? 0,
          y: placement?.positionY ?? 0,
        },
      ] as const
    }),
  )
}

export function OutfitPositionEditor({
  outfit,
  items,
  onSave,
}: OutfitPositionEditorProps) {
  const editableItems = useMemo(
    () =>
      outfit.itemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter((item): item is Item => Boolean(item?.image)),
    [items, outfit.itemIds],
  )
  const [selectedId, setSelectedId] = useState(editableItems[0]?.id ?? '')
  const [positions, setPositions] = useState(() => positionsFrom(outfit))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setPositions(positionsFrom(outfit))
  }, [outfit])

  useEffect(() => {
    if (!editableItems.some((item) => item.id === selectedId)) {
      setSelectedId(editableItems[0]?.id ?? '')
    }
  }, [editableItems, selectedId])

  const selectedItem = editableItems.find((item) => item.id === selectedId)
  const position = positions.get(selectedId) ?? { x: 0, y: 0 }
  const savedPosition = outfit.itemPlacements?.find(
    (entry) => entry.itemId === selectedId,
  )
  const dirty =
    position.x !== (savedPosition?.positionX ?? 0) ||
    position.y !== (savedPosition?.positionY ?? 0)
  const previewOutfit: Outfit = {
    ...outfit,
    itemPlacements: outfit.itemIds.map((itemId) => {
      const original = outfit.itemPlacements?.find(
        (entry) => entry.itemId === itemId,
      )
      const current = positions.get(itemId) ?? { x: 0, y: 0 }
      return {
        itemId,
        slot: original?.slot ?? null,
        positionX: current.x,
        positionY: current.y,
        itemScale: original?.itemScale ?? null,
        zIndex: original?.zIndex ?? null,
      }
    }),
  }

  const move = (delta: Position) => {
    if (!selectedId) return
    setSaved(false)
    setSaveError(null)
    setPositions((current) => {
      const next = new Map(current)
      const previous = next.get(selectedId) ?? { x: 0, y: 0 }
      next.set(selectedId, {
        x: previous.x + delta.x,
        y: previous.y + delta.y,
      })
      return next
    })
  }

  const reset = () => {
    if (!selectedId) return
    setSaved(false)
    setSaveError(null)
    setPositions((current) => {
      const next = new Map(current)
      next.set(selectedId, { x: 0, y: 0 })
      return next
    })
  }

  const save = async () => {
    if (!selectedItem || !dirty) return
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await onSave({
        outfitId: outfit.id,
        itemId: selectedItem.id,
        positionX: position.x,
        positionY: position.y,
      })
      setSaved(true)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '위치를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (editableItems.length === 0) return null

  return (
    <section className="section position-editor">
      <div className="section-heading">
        <div>
          <p className="eyebrow">POSITION</p>
          <h2>이미지 위치 조정</h2>
        </div>
        <span className="count">4px씩</span>
      </div>
      <p className="position-editor__note">
        아이템을 고른 뒤 화살표로 움직여 주세요. 크기와 레이어는 바뀌지
        않습니다.
      </p>

      <LayeredOutfitPreview
        outfit={previewOutfit}
        items={items}
        className="position-editor__preview"
      />

      <div className="position-editor__items" aria-label="조정할 아이템 선택">
        {editableItems.map((item) => (
          <button
            type="button"
            className="position-editor__item"
            aria-pressed={item.id === selectedId}
            onClick={() => {
              setSelectedId(item.id)
              setSaved(false)
              setSaveError(null)
            }}
            key={item.id}
          >
            <ItemVisual item={item} className="item-visual--position" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      {selectedItem && (
        <div className="position-editor__controls">
          <strong>{selectedItem.name}</strong>
          <span className="position-editor__coordinates" aria-live="polite">
            좌우 {position.x}px · 상하 {position.y}px
          </span>
          <div className="position-editor__arrows">
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 위로 4px 이동`}
              onClick={() => move({ x: 0, y: -STEP })}
            >
              <ArrowUp size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 왼쪽으로 4px 이동`}
              onClick={() => move({ x: -STEP, y: 0 })}
            >
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button position-editor__reset"
              aria-label={`${selectedItem.name} 원위치`}
              onClick={reset}
            >
              <RotateCcw size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 오른쪽으로 4px 이동`}
              onClick={() => move({ x: STEP, y: 0 })}
            >
              <ArrowRight size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`${selectedItem.name} 아래로 4px 이동`}
              onClick={() => move({ x: 0, y: STEP })}
            >
              <ArrowDown size={22} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="button button--primary button--wide"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? '저장 중…' : '이 위치 저장'}
          </button>
          {saved && (
            <p className="success-message" role="status">
              위치를 저장했습니다.
            </p>
          )}
          {saveError && (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
