import { ImagePlus } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { useClosetActions } from '../context/DataContext'
import {
  prepareItemCutout,
  type PreparedItemCutout,
} from '../lib/item-image'
import type { Item } from '../lib/types'

export function ItemImageEditor({ item }: { item: Item }) {
  const { replaceItemImage } = useClosetActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<PreparedItemCutout | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!prepared) {
      setPreviewUrl(null)
      return
    }
    const nextUrl = URL.createObjectURL(prepared.blob)
    setPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [prepared])

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPreparing(true)
    setError(null)
    setSaved(false)
    setPrepared(null)
    try {
      setPrepared(await prepareItemCutout(file))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '이미지를 준비하지 못했습니다.',
      )
    } finally {
      setPreparing(false)
      event.target.value = ''
    }
  }

  const save = async () => {
    if (!prepared || saving) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await replaceItemImage(item.id, prepared)
      setPrepared(null)
      setSaved(true)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '이미지를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel item-image-editor">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CUTOUT IMAGE</p>
          <h2>{item.image ? 'Item 이미지 교체' : 'Item 이미지 추가'}</h2>
        </div>
      </div>

      <p className="item-image-editor__intro">
        Item 전체가 보이는 투명 배경 PNG 또는 WebP를 선택해 주세요. 원본은
        업로드하지 않고 최적화된 cutout만 저장합니다.
      </p>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/png,image/webp"
        aria-label="Item cutout 파일"
        disabled={preparing || saving}
        onChange={(event) => void selectFile(event)}
      />

      {!prepared && (
        <button
          className="button button--secondary button--wide"
          type="button"
          disabled={preparing || saving}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={18} aria-hidden="true" />
          {preparing
            ? '이미지 검사·최적화 중…'
            : item.image
              ? '새 cutout 선택'
              : 'cutout 선택'}
        </button>
      )}

      {prepared && previewUrl && (
        <div className="item-image-review">
          <div className="item-image-review__preview">
            <img src={previewUrl} alt={`${item.name} 새 cutout 미리보기`} />
          </div>
          <dl>
            <div>
              <dt>크기</dt>
              <dd>
                {prepared.widthPx} × {prepared.heightPx}px
              </dd>
            </div>
            <div>
              <dt>용량</dt>
              <dd>{Math.ceil(prepared.bytes / 1024)}KB WebP</dd>
            </div>
          </dl>
          {prepared.warning && (
            <p className="item-image-editor__warning">{prepared.warning}</p>
          )}
          <p className="field-help">
            저장이 끝날 때까지 현재 이미지는 그대로 유지됩니다.
          </p>
          <div className="item-image-review__actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={saving}
              onClick={() => setPrepared(null)}
            >
              다시 선택
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '저장 중…' : '이 cutout 저장'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="success-message">새 cutout을 저장했습니다.</p>
      )}
    </section>
  )
}
