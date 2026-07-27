import {
  type ImgHTMLAttributes,
  type ReactNode,
  useEffect,
  useState,
} from 'react'
import type { ImageAsset } from '../lib/types'

interface AssetImageProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    'src' | 'alt' | 'width' | 'height' | 'onError'
  > {
  asset: ImageAsset | null | undefined
  alt: string
  fallback: ReactNode
}

export function AssetImage({
  asset,
  alt,
  fallback,
  loading = 'lazy',
  ...imageProps
}: AssetImageProps) {
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    setUnavailable(false)
    if (!asset?.expiresAt) return

    const expiresAtMs = Date.parse(asset.expiresAt)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      setUnavailable(true)
      return
    }

    const timeout = window.setTimeout(
      () => setUnavailable(true),
      expiresAtMs - Date.now(),
    )
    return () => window.clearTimeout(timeout)
  }, [asset?.expiresAt, asset?.url])

  const expiresAtMs = asset?.expiresAt
    ? Date.parse(asset.expiresAt)
    : null
  const expired =
    expiresAtMs !== null &&
    (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())

  if (!asset || unavailable || expired) return fallback

  return (
    <img
      {...imageProps}
      src={asset.url}
      alt={alt}
      width={asset.widthPx ?? undefined}
      height={asset.heightPx ?? undefined}
      loading={loading}
      decoding="async"
      onError={() => setUnavailable(true)}
    />
  )
}
