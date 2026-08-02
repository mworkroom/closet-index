import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { ItemDetailPage } from './ItemDetailPage'
import { ItemEditorPage } from './ItemEditorPage'

function renderEditor(
  repository: DemoRepository,
  initialEntry = '/closet/new',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/closet/new" element={<ItemEditorPage />} />
          <Route path="/closet" element={<p>Item 목록</p>} />
          <Route path="/closet/:itemId/edit" element={<ItemEditorPage />} />
          <Route path="/closet/:itemId" element={<p>저장 완료</p>} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('Item editor', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('같은 이름과 카테고리는 먼저 경고하고 명시적 확인 뒤 한 번만 생성한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    await repository.createItem({
      id: 'duplicate-seed',
      name: '네이비 셔츠',
      category: 'Top-Shirts',
      semanticColor: 'Navy',
      paletteId: null,
      displayHex: '#293A5B',
      seasons: ['Spring'],
      rainOk: true,
      longWalkOk: true,
      memo: null,
      acquiredOn: null,
    })
    const createItem = vi.spyOn(repository, 'createItem')

    renderEditor(repository)

    await user.type(
      await screen.findByRole('textbox', { name: '이름 *' }),
      '네이비 셔츠',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: '카테고리 *' }),
      'Top-Shirts',
    )
    await user.click(screen.getByRole('button', { name: 'Item 저장' }))

    expect(
      await screen.findByText('같은 이름과 카테고리의 Item이 이미 있습니다.'),
    ).toBeInTheDocument()
    expect(createItem).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', {
        name: '중복을 확인했고 그래도 저장',
      }),
    )

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    expect(createItem).toHaveBeenCalledTimes(1)
    expect(createItem.mock.calls[0][0]).toMatchObject({
      id: expect.any(String),
      name: '네이비 셔츠',
      category: 'Top-Shirts',
      displayHex: '#B8B8B4',
    })
  })

  it('기존 Item 정보를 불러와 같은 id로 수정한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const updateItem = vi.spyOn(repository, 'updateItem')

    renderEditor(repository, '/closet/item-cardigan/edit')

    const name = await screen.findByRole('textbox', { name: '이름 *' })
    const category = screen.getByRole('combobox', { name: '카테고리 *' })
    expect(category).toHaveValue('Outer-Cardigan')
    await user.clear(name)
    await user.type(name, '수정한 카디건')
    await user.selectOptions(category, 'Top-Knitwear')
    await user.click(screen.getByRole('button', { name: '변경 저장' }))

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    expect(updateItem).toHaveBeenCalledTimes(1)
    expect(updateItem).toHaveBeenCalledWith(
      'item-cardigan',
      expect.objectContaining({
        name: '수정한 카디건',
        category: 'Top-Knitwear',
      }),
    )
  })

  it('정보 수정 화면 최하단에서 삭제 가능 여부와 보관·복원을 제공한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const setItemRetired = vi.spyOn(repository, 'setItemRetired')

    renderEditor(repository, '/closet/item-cardigan/edit')

    expect(
      await screen.findByRole('heading', { name: /Item 이미지 (추가|교체)/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Item 삭제 및 보관' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByText(/포함된 Outfit \d+개가 있어 삭제할 수 없습니다\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '보관' }))
    expect(
      screen.getByText('이 Item을 보관할까요?'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '보관 확인' }))

    expect(setItemRetired).toHaveBeenCalledWith('item-cardigan', true)
    expect(
      await screen.findByRole('button', { name: '복원' }),
    ).toBeInTheDocument()
  })

  it('Outfit에 포함되지 않은 Item은 확인 뒤 영구 삭제한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    await repository.createItem({
      id: 'item-unlinked',
      name: '미연결 재킷',
      category: 'Outer-Jacket',
      semanticColor: 'Navy',
      paletteId: null,
      displayHex: '#293A5B',
      seasons: ['Fall'],
      rainOk: true,
      longWalkOk: true,
      memo: null,
      acquiredOn: null,
    })
    const deleteItem = vi.spyOn(repository, 'deleteItem')

    renderEditor(repository, '/closet/item-unlinked/edit')

    await user.click(await screen.findByRole('button', { name: '삭제' }))
    expect(screen.getByRole('alert')).toHaveTextContent('이 Item을 영구 삭제할까요?')
    await user.click(screen.getByRole('button', { name: '삭제 확인' }))

    expect(await screen.findByText('Item 목록')).toBeInTheDocument()
    expect(deleteItem).toHaveBeenCalledWith('item-unlinked')
    expect((await repository.load()).items.some((item) => item.id === 'item-unlinked')).toBe(false)
  })

  it('상세 화면은 수정 패널 없이 사용 정보와 Outfit만 보여 준다', async () => {
    const repository = new DemoRepository()

    render(
      <MemoryRouter initialEntries={['/closet/item-cardigan']}>
        <DataProvider repository={repository}>
          <Routes>
            <Route path="/closet/:itemId" element={<ItemDetailPage />} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('link', { name: '정보 수정' }),
    ).toBeInTheDocument()
    expect(screen.getByText('착용 횟수')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '포함된 Outfit' })).toBeInTheDocument()
    expect(screen.queryByText('조건 적합성')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Item 이미지 (추가|교체)/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '보관' }),
    ).not.toBeInTheDocument()
  })
})
