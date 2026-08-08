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

  it('shows multiple direct parents, the current Item, children, and an inheritance badge', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([
        edge('parent-active', 'item-cardigan', 'item-knit', '계승 👑'),
        edge('parent-retired', 'item-loafers', 'item-knit', '대체 시도'),
        edge('child-tee', 'item-knit', 'item-tee', '기능 세분화'),
        edge('child-pants', 'item-knit', 'item-pants', '계승 👑'),
      ]),
    )

    renderItemDetail(new DemoRepository())

    const section = await screen.findByRole('region', { name: 'Replacement Line' })
    expect(await within(section).findByText('이전 2 · 다음 2')).toBeInTheDocument()
    const currentCard = within(section).getByLabelText('현재 Item 아이보리 니트')
    expect(currentCard).toBeInTheDocument()
    expect(within(currentCard).getByText('계승 👑')).toBeInTheDocument()
    expect(
      within(section).getByRole('link', { name: '브라운 로퍼 Item 상세 보기' }),
    ).toBeInTheDocument()
    expect(within(section).getByText('Retired')).toBeInTheDocument()
    expect(
      within(section).queryByRole('heading', { name: '현재 Item 선택 이유' }),
    ).not.toBeInTheDocument()
    expect(within(section).queryByText('블루 가디건 → 아이보리 니트')).not.toBeInTheDocument()
    expect(within(section).queryByText('온도 세분화')).not.toBeInTheDocument()
    expect(within(section).queryByText('브라운 로퍼 → 아이보리 니트')).not.toBeInTheDocument()
    expect(within(section).queryByText('대체 시도')).not.toBeInTheDocument()
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

  it('places Replacement Line before replenishment and included Outfit', async () => {
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([edge('order-edge', 'item-cardigan', 'item-tee', '대체 시도')]),
    )

    renderItemDetail(new DemoRepository(), 'item-tee')

    await screen.findByRole('region', { name: 'Replacement Line' })
    const headingNames = within(screen.getByRole('main'))
      .getAllByRole('heading')
      .map((heading) => heading.textContent)
    const monthlyWearIndex = headingNames.indexOf('월별 착용 분포')
    const replacementLineIndex = headingNames.indexOf('Replacement Line')
    const replenishmentIndex = headingNames.indexOf('재구매와 현재 수량')
    const includedOutfitIndex = headingNames.indexOf('포함된 Outfit')

    expect(monthlyWearIndex).toBeGreaterThanOrEqual(0)
    expect(monthlyWearIndex).toBeLessThan(replacementLineIndex)
    expect(replacementLineIndex).toBeLessThan(replenishmentIndex)
    expect(replenishmentIndex).toBeLessThan(includedOutfitIndex)
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
    await user.clear(within(section).getByLabelText('재구매 날짜'))
    await user.type(within(section).getByLabelText('재구매 날짜'), '2026-07-24')
    await user.clear(within(section).getByLabelText('구매 수량'))
    await user.type(within(section).getByLabelText('구매 수량'), '2')
    await user.clear(within(section).getByLabelText('저장 후 현재 수량'))
    await user.type(within(section).getByLabelText('저장 후 현재 수량'), '4')
    await user.click(
      within(section).getByRole('button', { name: '재구매 저장' }),
    )

    expect(await within(section).findByText('4개')).toBeInTheDocument()
    expect(await within(section).findByText('7/24/26 2개 구매')).toBeInTheDocument()
    await expect(repository.purchases.load(item.id)).resolves.toHaveLength(1)
  })

  it('일반 Item은 기록이 생긴 뒤 상세 화면에 읽기 전용 이력만 간단히 보여 준다', async () => {
    const repository = new DemoRepository()
    await repository.purchases.create({
      id: 'general-purchase-event',
      itemId: 'item-cardigan',
      purchasedOn: '2026-07-20',
      quantity: 2,
      currentQuantity: null,
    })

    renderItemDetail(repository, 'item-cardigan')

    const section = await screen.findByRole('region', { name: '재구매 이력' })
    expect(within(section).getByText('7/20/26 2개 구매')).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: '재구매 기록' })).not.toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('재구매 기록이 없는 일반 Item 상세에는 재구매 영역을 만들지 않는다', async () => {
    renderItemDetail(new DemoRepository(), 'item-cardigan')

    await screen.findByRole('heading', { name: '블루 가디건' })
    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: '재구매 이력' }),
      ).not.toBeInTheDocument()
    })
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
    expect(within(section).getByText('7/20/26 2개 구매')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '수정' }))
    await user.clear(within(section).getByLabelText('구매 수량'))
    await user.type(within(section).getByLabelText('구매 수량'), '5')
    await user.click(
      within(section).getByRole('button', { name: '변경 저장' }),
    )
    expect(await within(section).findByText('7/20/26 5개 구매')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '삭제' }))
    expect(
      within(section).getByText(
        '이 기록을 삭제할까요? 현재 보유 수량은 바뀌지 않습니다.',
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

describe('ItemDetailPage care history', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('Category에서 정한 관리 방식을 기록하고 이력을 수정·삭제한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    renderItemDetail(repository, 'item-knit')

    const section = await screen.findByRole('region', {
      name: '손세탁·드라이클리닝',
    })
    expect(within(section).queryByText('현재 관리 방식')).not.toBeInTheDocument()
    expect(within(section).queryByText('최근 관리일')).not.toBeInTheDocument()
    expect(within(section).getByText('세탁 이력')).toBeInTheDocument()

    await user.click(
      within(section).getByRole('button', { name: '드라이클리닝 완료' }),
    )
    await user.clear(within(section).getByLabelText('관리 날짜'))
    await user.type(within(section).getByLabelText('관리 날짜'), '2026-08-01')
    await user.click(
      within(section).getByRole('button', { name: '관리 기록 저장' }),
    )

    expect(
      (await within(section).findAllByText('8/1/26')).length,
    ).toBeGreaterThan(0)
    expect(await repository.care.load('item-knit')).toHaveLength(1)

    await user.click(within(section).getByRole('button', { name: '수정' }))
    await user.selectOptions(
      within(section).getByLabelText('당시 관리 방식'),
      'hand_wash',
    )
    await user.click(
      within(section).getByRole('button', { name: '변경 저장' }),
    )
    expect(
      (await repository.care.load('item-knit'))[0].method,
    ).toBe('hand_wash')

    await user.click(within(section).getByRole('button', { name: '삭제' }))
    expect(
      within(section).getByText(/현재 주기는 남은 최신 기록으로 다시 계산/),
    ).toBeInTheDocument()
    await user.click(
      within(section).getByRole('button', { name: '기록 삭제' }),
    )
    expect(
      await within(section).findByText('아직 관리 기록이 없습니다.'),
    ).toBeInTheDocument()
  })

  it('세탁 이력은 짧은 날짜와 수정·삭제 버튼을 한 행에 표시한다', async () => {
    const repository = new DemoRepository()
    await repository.care.create({
      id: 'care-recent',
      itemId: 'item-knit',
      caredOn: '2026-05-14',
      method: 'dry_cleaning',
    })
    await repository.care.create({
      id: 'care-old',
      itemId: 'item-knit',
      caredOn: '2022-08-07',
      method: 'dry_cleaning',
    })

    renderItemDetail(repository, 'item-knit')

    const section = await screen.findByRole('region', {
      name: '손세탁·드라이클리닝',
    })
    const history = section.querySelector('.replenishment-history')
    expect(history).not.toBeNull()
    expect(within(history as HTMLElement).getByRole('heading', { name: '세탁 이력' })).toBeInTheDocument()

    const rows = Array.from(history?.querySelectorAll('ul > li') ?? []) as HTMLElement[]
    expect(rows).toHaveLength(2)
    for (const [date, row] of [
      ['5/14/26', rows.find((candidate) => candidate.textContent?.includes('5/14/26'))],
      ['8/7/22', rows.find((candidate) => candidate.textContent?.includes('8/7/22'))],
    ] as const) {
      expect(row).toBeDefined()
      expect(within(row as HTMLElement).getByText(date)).toBeInTheDocument()
      expect(within(row as HTMLElement).getByRole('button', { name: '수정' })).toBeInTheDocument()
      expect(within(row as HTMLElement).getByRole('button', { name: '삭제' })).toBeInTheDocument()
      expect(row?.textContent).not.toContain('드라이클리닝')
      expect(row?.querySelector('.replenishment-history__entry')).not.toBeNull()
      expect(row?.querySelector('.replenishment-history__actions')).not.toBeNull()
    }
  })

  it('Retired Item은 관리 이력을 보이되 새 기록과 진행 상태를 숨긴다', async () => {
    const repository = new DemoRepository()
    await repository.care.create({
      id: 'retired-care',
      itemId: 'item-knit',
      caredOn: '2026-08-01',
      method: 'dry_cleaning',
    })
    await repository.setItemRetired('item-knit', true)
    renderItemDetail(repository, 'item-knit')

    const section = await screen.findByRole('region', {
      name: '손세탁·드라이클리닝',
    })
    expect(within(section).getByText('세탁 이력')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: '수정' })).toBeInTheDocument()
    expect(
      within(section).queryByRole('button', { name: '드라이클리닝 완료' }),
    ).not.toBeInTheDocument()
    expect(within(section).queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
