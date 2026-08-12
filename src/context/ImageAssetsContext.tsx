import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ClosetRepository } from '../data/repository'
import type { ImageAsset } from '../lib/types'

const IMAGE_OBSERVER_ROOT_MARGIN = '600px 0px'

interface ImageAssetsState {
  objectUrls: Map<string, string>
  requestImages: (storagePaths: string[]) => void
}

const ImageAssetsContext = createContext<ImageAssetsState | null>(null)

function revokeObjectUrls(urls: Iterable<string>) {
  if (typeof URL.revokeObjectURL !== 'function') return
  for (const url of urls) URL.revokeObjectURL(url)
}

export function ImageAssetsProvider({
  repository,
  children,
}: PropsWithChildren<{ repository: ClosetRepository }>) {
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(
    () => new Map(),
  )
  const objectUrlsRef = useRef(objectUrls)
  const queuedPathsRef = useRef(new Set<string>())
  const inFlightPathsRef = useRef(new Set<string>())
  const flushTimerRef = useRef<number | null>(null)
  const flushRef = useRef<() => Promise<void>>(async () => undefined)
  const generationRef = useRef(0)

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      void flushRef.current()
    }, 0)
  }, [])

  const requestImages = useCallback(
    (storagePaths: string[]) => {
      if (!repository.downloadItemImages) return
      for (const path of storagePaths) {
        if (
          !path ||
          objectUrlsRef.current.has(path) ||
          inFlightPathsRef.current.has(path)
        ) {
          continue
        }
        queuedPathsRef.current.add(path)
      }
      if (queuedPathsRef.current.size > 0) scheduleFlush()
    },
    [repository, scheduleFlush],
  )

  flushRef.current = async () => {
    if (!repository.downloadItemImages) return
    const paths = [...queuedPathsRef.current].filter(
      (path) =>
        !objectUrlsRef.current.has(path) &&
        !inFlightPathsRef.current.has(path),
    )
    queuedPathsRef.current.clear()
    if (paths.length === 0) return

    const generation = generationRef.current
    paths.forEach((path) => inFlightPathsRef.current.add(path))
    try {
      const blobs = await repository.downloadItemImages(paths)
      if (generation !== generationRef.current) return

      const next = new Map(objectUrlsRef.current)
      for (const [path, blob] of blobs) {
        if (next.has(path) || typeof URL.createObjectURL !== 'function') continue
        next.set(path, URL.createObjectURL(blob))
      }
      if (next.size !== objectUrlsRef.current.size) {
        objectUrlsRef.current = next
        setObjectUrls(next)
      }
    } finally {
      paths.forEach((path) => inFlightPathsRef.current.delete(path))
      if (queuedPathsRef.current.size > 0) scheduleFlush()
    }
  }

  useEffect(() => {
    generationRef.current += 1
    queuedPathsRef.current.clear()
    inFlightPathsRef.current.clear()
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    revokeObjectUrls(objectUrlsRef.current.values())
    const empty = new Map<string, string>()
    objectUrlsRef.current = empty
    setObjectUrls(empty)

    return () => {
      generationRef.current += 1
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      revokeObjectUrls(objectUrlsRef.current.values())
    }
  }, [repository])

  const value = useMemo(
    () => ({ objectUrls, requestImages }),
    [objectUrls, requestImages],
  )

  return (
    <ImageAssetsContext.Provider value={value}>
      {children}
    </ImageAssetsContext.Provider>
  )
}

function hasUsableUrl(asset: ImageAsset) {
  if (!asset.url) return false
  if (!asset.expiresAt) return true
  const expiresAtMs = Date.parse(asset.expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()
}

export function useLazyImageAssets(
  assets: Array<ImageAsset | null | undefined>,
  targetRef: RefObject<Element | null>,
  loading: 'eager' | 'lazy' = 'lazy',
) {
  const context = useContext(ImageAssetsContext)
  const paths = assets
    .filter((asset): asset is ImageAsset => Boolean(asset))
    .filter((asset) => !hasUsableUrl(asset))
    .map((asset) => asset.storagePath)
    .filter((path) => !context?.objectUrls.has(path))
  const pathSignature = [...new Set(paths)].sort().join('\n')

  useEffect(() => {
    if (!context || !pathSignature) return
    const request = () => context.requestImages(pathSignature.split('\n'))
    if (loading === 'eager' || typeof IntersectionObserver === 'undefined') {
      request()
      return
    }

    const target = targetRef.current
    if (!target) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        request()
        observer.disconnect()
      },
      { rootMargin: IMAGE_OBSERVER_ROOT_MARGIN },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [context, loading, pathSignature, targetRef])

  return useMemo(() => {
    const result = new Map<string, ImageAsset>()
    for (const asset of assets) {
      if (!asset) continue
      if (hasUsableUrl(asset)) {
        result.set(asset.storagePath, asset)
        continue
      }
      const objectUrl = context?.objectUrls.get(asset.storagePath)
      if (objectUrl) {
        result.set(asset.storagePath, {
          ...asset,
          url: objectUrl,
          expiresAt: null,
        })
      }
    }
    return result
  }, [assets, context?.objectUrls])
}
