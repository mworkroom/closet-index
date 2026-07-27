import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '../lib/types'
import { AssetImage } from './AssetImage'

const asset: ImageAsset = {
  id: 'image-1',
  storagePath: 'workspace/items/item-1/cutout/image-1.webp',
  url: 'https://project.supabase.co/storage/image.webp?token=test',
  widthPx: 800,
  heightPx: 1200,
  expiresAt: null,
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AssetImage', () => {
  it('metadata가 없으면 처음부터 기존 fallback을 표시한다', () => {
    render(
      <AssetImage
        asset={null}
        alt="블루 가디건"
        fallback={<span>색상 fallback</span>}
      />,
    )

    expect(screen.getByText('색상 fallback')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('이미지 로드가 실패하면 깨진 이미지 대신 fallback으로 전환한다', () => {
    render(
      <AssetImage
        asset={asset}
        alt="블루 가디건"
        fallback={<span>색상 fallback</span>}
      />,
    )

    fireEvent.error(screen.getByRole('img', { name: '블루 가디건' }))

    expect(screen.getByText('색상 fallback')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('signed URL이 만료되면 자동으로 fallback으로 전환한다', () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-07-27T00:00:00.000Z')
    vi.setSystemTime(now)

    render(
      <AssetImage
        asset={{
          ...asset,
          expiresAt: new Date(now + 1000).toISOString(),
        }}
        alt="블루 가디건"
        fallback={<span>색상 fallback</span>}
      />,
    )

    expect(screen.getByRole('img')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('색상 fallback')).toBeInTheDocument()
  })
})
