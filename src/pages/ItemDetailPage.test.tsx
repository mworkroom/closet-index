import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import type { ReplacementLineEdge } from '../lib/types'
import { ItemDetailPage } from './ItemDetailPage'

function edge(
  id: string,
  predecessorItemId: string,
  successorItemId: string,
  decisionReason: string,
): ReplacementLineEdge {
  return {
    id,
    replacementLineId: 'line-detail-test',
    predecessorItemId,
    successorItemId,
    sourceLegacyLinkId: null,
    sourceKind: 'manual',
    branchName: null,
    decisionReason,
    status: 'confirmed',
    confirmedAt: '2026-08-06T00:00:00Z',
    updatedAt: '2026-08-06T00:00:00Z',
  }
}

function renderItemDetail(repository: DemoRepository, itemId = 'item-knit') {
  return render(
    <MemoryRouter initialEntries={[`/closet/${itemId}`]}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/closet/:itemId" element={<ItemDetailPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('ItemDetailPage Replacement Line', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('shows multiple direct parents, the current Item, children, and incoming reasons', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([
        edge('parent-active', 'item-cardigan', 'item-knit', '온도 세분화'),
        edge('parent-retired', 'item-loafers', 'item-knit', '대체 시도'),
        edge('child-tee', 'item-knit', 'item-tee', '기능 세분화'),
        edge('child-pants', 'item-knit', 'item-pants', '계승 👑'),
      ]),
    )

    renderItemDetail(new DemoRepository())

    const section = await screen.findByRole('region', { name: 'Replacement Line' })
    expect(await within(section).findByText('이전 2 · 다음 2')).toBeInTheDocument()
    expect(within(section).getByLabelText('현재 Item 아이보리 니트')).toBeInTheDocument()
    expect(
      within(section).getByRole('link', { name: '브라운 로퍼 Item 상세 보기' }),
    ).toBeInTheDocument()
    expect(within(section).getByText('Retired')).toBeInTheDocument()
    expect(within(section).getByText('블루 가디건 → 아이보리 니트')).toBeInTheDocument()
    expect(within(section).getByText('온도 세분화')).toBeInTheDocument()
    expect(within(section).getByText('브라운 로퍼 → 아이보리 니트')).toBeInTheDocument()
    expect(within(section).getByText('대체 시도')).toBeInTheDocument()
    expect(within(section).queryByText('기능 세분화')).not.toBeInTheDocument()

    await user.click(
      within(section).getByRole('link', { name: '네이비 티셔츠 Item 상세 보기' }),
    )
    expect(
      await screen.findByRole('heading', { name: '네이비 티셔츠' }),
    ).toBeInTheDocument()
  })

  it('labels an Item without parents as the start and hides a disconnected lineage', async () => {
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([edge('start-child', 'item-knit', 'item-tee', '대체 시도')]),
    )

    const view = renderItemDetail(new DemoRepository())
    const section = await screen.findByRole('region', { name: 'Replacement Line' })
    expect(await within(section).findByText('시작 Item')).toBeInTheDocument()

    view.unmount()
    renderItemDetail(new DemoRepository(), 'item-skirt')
    await screen.findByRole('heading', { name: '차콜 스커트' })
    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: 'Replacement Line' }),
      ).not.toBeInTheDocument()
    })
  })

  it('keeps the rest of Item detail usable when edge loading fails and retries locally', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const loadEdges = vi
      .spyOn(repository.replacementLines, 'loadEdges')
      .mockRejectedValueOnce(new Error('edge 조회 실패'))
      .mockResolvedValueOnce([])

    renderItemDetail(repository)

    expect(await screen.findByText('착용 횟수')).toBeInTheDocument()
    expect(await screen.findByText('edge 조회 실패')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '포함된 Outfit' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(loadEdges).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(screen.queryByText('edge 조회 실패')).not.toBeInTheDocument()
    })
  })
})

describe('ItemDetailPage replenishment', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('대상 분류의 재구매와 저장 후 현재 수량을 한 번에 기록한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const item = (await repository.load()).items.find(
      (entry) => entry.id === 'item-tee',
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

    renderItemDetail(repository, item.id)

    const section = await screen.findByRole('region', {
      name: '재구매와 현재 수량',
    })
    expect(within(section).getByText('미입력')).toBeInTheDocument()
    await user.click(
      within(section).getByRole('button', { name: '재구매 기록' }),
    )
    await user.clear(within(section).getByLabelText('구매 수량'))
    await user.type(within(section).getByLabelText('구매 수량'), '2')
    await user.clear(within(section).getByLabelText('저장 후 현재 수량'))
    await user.type(within(section).getByLabelText('저장 후 현재 수량'), '4')
    await user.click(
      within(section).getByRole('button', { name: '재구매 저장' }),
    )

    expect(await within(section).findByText('4개')).toBeInTheDocument()
    expect(await within(section).findByText('2개 구매')).toBeInTheDocument()
    await expect(repository.purchases.load(item.id)).resolves.toHaveLength(1)
  })

  it('Retired Item은 새 기록·수량 편집을 숨기고 기존 이력 수정·삭제를 유지한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const purchase = await repository.purchases.create({
      id: 'retired-purchase-event',
      itemId: 'item-tee',
      purchasedOn: '2026-07-20',
      quantity: 2,
      currentQuantity: 3,
    })
    await repository.setItemRetired('item-tee', true)

    renderItemDetail(repository, 'item-tee')

    const section = await screen.findByRole('region', {
      name: '재구매와 현재 수량',
    })
    expect(within(section).queryByRole('button', { name: '재구매 기록' })).not.toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: '수량 저장' })).not.toBeInTheDocument()
    expect(within(section).getByText('2개 구매')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '수정' }))
    await user.clear(within(section).getByLabelText('구매 수량'))
    await user.type(within(section).getByLabelText('구매 수량'), '5')
    await user.click(
      within(section).getByRole('button', { name: '변경 저장' }),
    )
    expect(await within(section).findByText('5개 구매')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '삭제' }))
    expect(
      within(section).getByText(
        '이 재구매 기록을 삭제할까요? 현재 보유 수량은 바뀌지 않습니다.',
      ),
    ).toBeInTheDocument()
    await user.click(
      within(section).getByRole('button', { name: '기록 삭제' }),
    )
    expect(
      await within(section).findByText('아직 재구매 기록이 없습니다.'),
    ).toBeInTheDocument()
    expect(
      (await repository.load()).items.find((item) => item.id === 'item-tee')
        ?.currentQuantity,
    ).toBe(3)
    expect(purchase.quantity).toBe(2)
  })
})
