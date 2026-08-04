import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import type { ReplacementLineEdge } from '../lib/types'
import { ReplacementLineagePage } from './ReplacementLineagePage'

const savedEdge: ReplacementLineEdge = {
  id: 'edge-layer',
  replacementLineId: 'line-soft-layer',
  predecessorItemId: 'item-cardigan',
  successorItemId: 'item-knit',
  sourceLegacyLinkId: 'legacy-layer',
  sourceKind: 'legacy_link',
  branchName: null,
  decisionReason: '구매일이 아니라 확인한 대체 관계',
  status: 'confirmed',
  confirmedAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
}

describe('ReplacementLineagePage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([savedEdge]),
    )
    window.localStorage.setItem(
      'closet-index-demo-legacy-link-reviews:v1',
      JSON.stringify({
        'legacy-layer': {
          reviewStatus: 'reviewed',
          reviewDecision: 'a_to_b',
          reviewReason: '구매일이 아니라 확인한 대체 관계',
          reviewedAt: '2026-08-03T00:00:00.000Z',
          updatedAt: '2026-08-03T00:00:00.000Z',
        },
      }),
    )
  })
  afterEach(cleanup)

  it('renders graph generations from confirmed direction and opens Item detail', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-soft-layer']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
            <Route path="/closet/:itemId" element={<p>Item 상세 도착</p>} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Soft Layer' })).toBeInTheDocument()
    expect(screen.getByText('사용 중 2 · Retired 0')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'G0 · 시작 아이템' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'G1 · 시작 아이템에서 이어짐' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(
      screen.queryByText('선택 이유 · 구매일이 아니라 확인한 대체 관계'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByText('연결 수정'))
    expect(screen.getByLabelText('이전 Item')).toHaveValue('item-cardigan')
    const reasonField = screen.getByLabelText('선택 이유')
    expect(reasonField).toHaveValue('')
    await user.selectOptions(reasonField, '계승 👑')
    await user.type(screen.getByLabelText('가지 이름 (선택)'), '여유로운 핏')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(
      await screen.findByText('선택 이유 · 계승 👑'),
    ).toBeInTheDocument()
    expect(screen.getByText('가지 · 여유로운 핏')).toBeInTheDocument()
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-edges:v1') ?? '[]',
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'edge-layer',
        decisionReason: '계승 👑',
        branchName: '여유로운 핏',
        sourceLegacyLinkId: null,
        sourceKind: 'manual',
      }),
    ])

    await user.click(
      screen.getByRole('link', { name: '아이보리 니트 Item 상세 보기' }),
    )
    expect(screen.getByText('Item 상세 도착')).toBeInTheDocument()
  })

  it('disconnects an incoming edge and keeps the child as an explicit G0 start', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-soft-layer']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Soft Layer' })
    await user.click(screen.getByText('연결 수정'))
    await user.click(screen.getByRole('button', { name: '계보에서 빼기' }))

    expect(
      screen.getByText(/같은 Line의 시작점으로/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/연결 해제 뒤.*다른 Line으로 옮길 수 있습니다/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '연결 해제' }))

    const generationZero = await screen.findByRole('heading', {
      name: 'G0 · 시작 아이템',
    })
    expect(
      within(generationZero.closest('section')!).getByText('아이보리 니트'),
    ).toBeInTheDocument()
    expect(screen.getByText('지정한 시작점')).toBeInTheDocument()
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-edges:v1') ?? '[]',
      ),
    ).toEqual([])
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-starts:v1') ?? '[]',
      ),
    ).toEqual([
      expect.objectContaining({
        replacementLineId: 'line-soft-layer',
        itemId: 'item-knit',
      }),
    ])
  })

  it('reverses a confirmed edge only after confirmation and recalculates generations', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-soft-layer']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Soft Layer' })
    await user.click(
      screen.getByRole('button', {
        name: '블루 가디건에서 아이보리 니트으로 이어진 방향 바꾸기',
      }),
    )
    expect(screen.getByText('앞뒤 방향을 바꿀까요?')).toBeInTheDocument()
    expect(
      screen.getByText(
        '시작점과 세대가 다시 계산됩니다. 순환이 생기는 방향은 저장되지 않습니다.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '방향 바꾸기' }))

    const generationZero = screen
      .getByRole('heading', { name: 'G0 · 시작 아이템' })
      .closest('section')
    const generationOne = screen
      .getByRole('heading', { name: 'G1 · 시작 아이템에서 이어짐' })
      .closest('section')
    expect(generationZero).not.toBeNull()
    expect(generationOne).not.toBeNull()
    expect(within(generationZero!).getByText('아이보리 니트')).toBeInTheDocument()
    expect(within(generationOne!).getByText('블루 가디건')).toBeInTheDocument()
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-edges:v1') ?? '[]',
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'edge-layer',
        predecessorItemId: 'item-knit',
        successorItemId: 'item-cardigan',
      }),
    ])
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-legacy-link-reviews:v1') ??
          '{}',
      )['legacy-layer'],
    ).toEqual(expect.objectContaining({ reviewDecision: 'b_to_a' }))
  })

  it('moves a standalone member into G0 when it is explicitly designated as a start', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-navy-tee']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Navy Tee' })
    await user.click(screen.getByRole('button', { name: '시작점으로 지정' }))

    expect(
      await screen.findByRole('heading', { name: 'G0 · 시작 아이템' }),
    ).toBeInTheDocument()
    expect(screen.getByText('지정한 시작점')).toBeInTheDocument()
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-starts:v1') ?? '[]',
      ),
    ).toEqual([
      expect.objectContaining({
        replacementLineId: 'line-navy-tee',
        itemId: 'item-tee',
      }),
    ])

    await user.click(screen.getByRole('button', { name: '시작점 해제' }))
    expect(await screen.findByRole('heading', { name: '계보 연결 전' })).toBeInTheDocument()
    expect(screen.queryByText('지정한 시작점')).not.toBeInTheDocument()
  })

  it('creates a manual predecessor edge for an unconnected member', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-everyday-shoes']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Everyday Shoes' })
    const targetCard = screen
      .getByRole('link', { name: '화이트 스니커즈 Item 상세 보기' })
      .closest<HTMLElement>('.lineage-unconnected__item')
    expect(targetCard).not.toBeNull()
    await user.click(within(targetCard!).getByRole('button', { name: '계보에 연결' }))
    await user.selectOptions(screen.getByLabelText('이전 Item'), 'item-loafers')
    await user.selectOptions(screen.getByLabelText('선택 이유'), '단순 교체')
    await user.click(screen.getByRole('button', { name: '연결 저장' }))

    const generationZero = screen
      .getByRole('heading', { name: 'G0 · 시작 아이템' })
      .closest('section')
    const generationOne = screen
      .getByRole('heading', { name: 'G1 · 시작 아이템에서 이어짐' })
      .closest('section')
    expect(within(generationZero!).getByText('브라운 로퍼')).toBeInTheDocument()
    expect(within(generationOne!).getByText('화이트 스니커즈')).toBeInTheDocument()
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-edges:v1') ?? '[]',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          replacementLineId: 'line-everyday-shoes',
          predecessorItemId: 'item-loafers',
          successorItemId: 'item-shoes',
          sourceLegacyLinkId: null,
          sourceKind: 'manual',
          decisionReason: '단순 교체',
        }),
      ]),
    )
  })

  it('moves an unconnected Item into a new Line and opens its reviewed lineage', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-navy-tee']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Navy Tee' })
    await user.click(
      screen.getByRole('button', { name: '다른 Line으로 옮기기' }),
    )
    await user.selectOptions(screen.getByLabelText('옮길 Line'), '__new__')
    await user.type(screen.getByLabelText(/새 Line 이름/), 'Navy Summer Tee')
    await user.type(screen.getByLabelText('Style Identity (선택)'), 'Summer Daily')
    await user.click(screen.getByRole('button', { name: 'Line 이동' }))

    expect(
      await screen.findByRole('heading', { name: 'Navy Summer Tee' }),
    ).toBeInTheDocument()
    expect(screen.getByText('지정한 시작점')).toBeInTheDocument()
    expect(
      screen.getByText('Line membership이 변경되어 계보 재검토가 필요합니다.'),
    ).toBeInTheDocument()
  })

  it('archives and restores a standalone Line without changing its lineage data', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-navy-tee']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Navy Tee' })
    await user.click(screen.getByRole('button', { name: 'Line 보관' }))
    await user.click(screen.getByRole('button', { name: 'Line 보관' }))

    expect(
      await screen.findByText('보관된 Line입니다. 계보는 읽기 전용으로 표시됩니다.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '시작점으로 지정' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 사용' }))
    await user.click(screen.getByRole('button', { name: '다시 사용' }))

    expect(
      screen.queryByText('보관된 Line입니다. 계보는 읽기 전용으로 표시됩니다.'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Line 보관' })).toBeInTheDocument()
  })

  it('changes the Line color category and keeps it editable', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-navy-tee']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Navy Tee' })
    expect(screen.getByText('Navy')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '색상 수정' }))
    await user.selectOptions(screen.getByLabelText('Line 색상 category'), 'Blue')
    await user.click(screen.getByRole('button', { name: '색상 저장' }))

    expect(await screen.findByText('Blue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '색상 수정' })).toBeInTheDocument()
    const savedSnapshot = JSON.parse(
      window.localStorage.getItem('closet-index-demo-replacement-lines:v1') ?? '{}',
    )
    expect(
      savedSnapshot.lines.find(
        (line: { id: string }) => line.id === 'line-navy-tee',
      ),
    ).toMatchObject({ colorCategory: 'Blue' })
  })

  it('merges the current Line into the chosen representative after explicit confirmation', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-navy-tee']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Navy Tee' })
    await user.click(
      screen.getByRole('button', { name: '대표 Line으로 병합' }),
    )
    await user.selectOptions(screen.getByLabelText('대표 Line'), 'line-soft-layer')
    await user.click(
      screen.getByRole('checkbox', {
        name: '병합 대상과 변경 내용을 확인했습니다.',
      }),
    )
    await user.click(screen.getByRole('button', { name: '이 Line을 병합' }))

    expect(
      await screen.findByRole('heading', { name: 'Soft Layer' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Line membership이 변경되어 계보 재검토가 필요합니다.',
      ),
    ).toBeInTheDocument()
    expect(await screen.findByText('3 Item')).toBeInTheDocument()

    const savedSnapshot = JSON.parse(
      window.localStorage.getItem('closet-index-demo-replacement-lines:v1') ?? '{}',
    )
    expect(
      savedSnapshot.lines.find(
        (line: { id: string }) => line.id === 'line-navy-tee',
      ),
    ).toMatchObject({
      lifecycleStatus: 'archived',
      representativeLineId: 'line-soft-layer',
    })
    expect(savedSnapshot.memberships).toContainEqual({
      replacementLineId: 'line-soft-layer',
      itemId: 'item-tee',
    })
  })
})
