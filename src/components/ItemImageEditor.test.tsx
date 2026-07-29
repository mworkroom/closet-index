import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataProvider, useClosetData } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { prepareItemCutout } from '../lib/item-image'
import { ItemImageEditor } from './ItemImageEditor'

vi.mock('../lib/item-image', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../lib/item-image')>()
  return {
    ...original,
    prepareItemCutout: vi.fn(),
  }
})

function Probe() {
  const { data } = useClosetData()
  const item = data?.items.find((entry) => entry.id === 'item-cardigan')
  return item ? <ItemImageEditor item={item} /> : <p>loading</p>
}

describe('ItemImageEditor', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows the optimized preview and saves only the prepared WebP', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['webp'], { type: 'image/webp' })
    vi.mocked(prepareItemCutout).mockResolvedValue({
      blob,
      widthPx: 800,
      heightPx: 1200,
      bytes: 164000,
      warning: null,
    })
    const repository = new DemoRepository()
    const replaceItemImage = vi
      .spyOn(repository, 'replaceItemImage')
      .mockResolvedValue()

    render(
      <DataProvider repository={repository}>
        <Probe />
      </DataProvider>,
    )

    const input = await screen.findByLabelText('Item cutout 파일')
    await user.upload(
      input,
      new File(['input'], 'cutout.png', { type: 'image/png' }),
    )

    expect(
      await screen.findByAltText('블루 가디건 새 cutout 미리보기'),
    ).toBeInTheDocument()
    expect(screen.getByText('800 × 1200px')).toBeInTheDocument()
    expect(screen.getByText('161KB WebP')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: '이 cutout 저장' }),
    )

    expect(replaceItemImage).toHaveBeenCalledWith('item-cardigan', {
      blob,
      widthPx: 800,
      heightPx: 1200,
      bytes: 164000,
      warning: null,
    })
    expect(
      await screen.findByText('새 cutout을 저장했습니다.'),
    ).toBeInTheDocument()
  })
})
