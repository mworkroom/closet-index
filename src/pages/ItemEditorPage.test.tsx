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
    await user.type(
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
    await user.clear(name)
    await user.type(name, '수정한 카디건')
    await user.click(screen.getByRole('button', { name: '변경 저장' }))

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    expect(updateItem).toHaveBeenCalledTimes(1)
    expect(updateItem).toHaveBeenCalledWith(
      'item-cardigan',
      expect.objectContaining({ name: '수정한 카디건' }),
    )
  })

  it('상세 화면에서 확인 절차를 거쳐 Retired로 전환한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const setItemRetired = vi.spyOn(repository, 'setItemRetired')

    render(
      <MemoryRouter initialEntries={['/closet/item-cardigan']}>
        <DataProvider repository={repository}>
          <Routes>
            <Route path="/closet/:itemId" element={<ItemDetailPage />} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await user.click(
      await screen.findByRole('button', { name: 'Retired로 전환' }),
    )
    expect(
      screen.getByText('이 Item을 Retired로 전환할까요?'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Retired로 전환' }),
    )

    expect(setItemRetired).toHaveBeenCalledWith('item-cardigan', true)
    expect(
      await screen.findByRole('heading', { name: 'Retired Item' }),
    ).toBeInTheDocument()
  })
})
