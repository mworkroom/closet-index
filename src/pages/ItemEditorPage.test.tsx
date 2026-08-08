import { cleanup, render, screen, within } from '@testing-library/react'
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

  it('정보 수정 화면 최하단에서 삭제 가능 여부와 Retired 전환·해제를 제공한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const setItemRetired = vi.spyOn(repository, 'setItemRetired')

    renderEditor(repository, '/closet/item-cardigan/edit')

    expect(
      await screen.findByRole('heading', { name: /Item 이미지 (추가|교체)/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Item 삭제 및 Retired 관리' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByText(/포함된 Outfit \d+개가 있어 삭제할 수 없습니다\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retired' }))
    expect(
      screen.getByText('이 Item을 Retired로 전환할까요?'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retired 확인' }))

    expect(setItemRetired).toHaveBeenCalledWith('item-cardigan', true)
    expect(
      await screen.findByRole('button', { name: 'Retired 해제' }),
    ).toBeInTheDocument()
  })

  it('일반 Item은 정보 수정 화면에서 현재 수량을 바꾸지 않고 재구매를 기록한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()

    renderEditor(repository, '/closet/item-cardigan/edit')

    const section = await screen.findByRole('region', { name: '재구매 기록' })
    expect(
      within(section).getByText(
        '같은 Item을 다시 구입했을 때 날짜와 수량을 기록합니다.',
      ),
    ).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '재구매 기록' }))
    await user.clear(within(section).getByLabelText('구매 수량'))
    await user.type(within(section).getByLabelText('구매 수량'), '2')
    await user.click(within(section).getByRole('button', { name: '재구매 저장' }))

    expect(await within(section).findByText(/\d+\/\d+\/\d+ 2개 구매/)).toBeInTheDocument()
    await expect(repository.purchases.load('item-cardigan')).resolves.toHaveLength(1)
    expect(
      (await repository.load()).items.find((item) => item.id === 'item-cardigan')
        ?.currentQuantity ?? null,
    ).toBeNull()
  })

  it('재구매 관리 대상 Item의 정보 수정 화면에는 기록 UI를 중복하지 않는다', async () => {
    const repository = new DemoRepository()
    const item = (await repository.load()).items.find(
      (entry) => entry.id === 'item-cardigan',
    )!
    await repository.updateItem(item.id, {
      name: item.name,
      category: 'Socks',
      semanticColor: item.semanticColor,
      paletteId: null,
      displayHex: item.displayHex,
      seasons: item.seasons,
      rainOk: item.rainOk,
      longWalkOk: item.longWalkOk,
      memo: item.memo,
      acquiredOn: item.acquiredOn,
    })

    renderEditor(repository, '/closet/item-cardigan/edit')

    await screen.findByRole('textbox', { name: '이름 *' })
    expect(
      screen.queryByRole('region', { name: '재구매 기록' }),
    ).not.toBeInTheDocument()
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
    const monthlyWearSection = screen
      .getByRole('heading', { name: '월별 착용 분포' })
      .closest('section')!
    expect(
      within(monthlyWearSection).getByText(/전체 기록 기간/),
    ).toBeInTheDocument()
    expect(
      within(monthlyWearSection).getAllByRole('img'),
    ).toHaveLength(12)
    expect(
      within(monthlyWearSection).getByRole('img', { name: /4월 \d+회/ }),
    ).toBeInTheDocument()
    expect(
      within(monthlyWearSection).getByRole('img', { name: '1월 0회' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '포함된 Outfit' })).toBeInTheDocument()
    expect(screen.queryByText('조건 적합성')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Item 이미지 (추가|교체)/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retired' }),
    ).not.toBeInTheDocument()
  })
})
