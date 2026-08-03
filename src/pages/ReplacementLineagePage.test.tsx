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
    expect(screen.getByText('선택 이유 · 구매일이 아니라 확인한 대체 관계')).toBeInTheDocument()

    await user.click(screen.getByText('계승 정보 수정'))
    const reasonField = screen.getByLabelText('선택 이유')
    await user.clear(reasonField)
    await user.type(reasonField, '레이어드 균형이 더 좋아서 선택')
    await user.type(screen.getByLabelText('가지 이름 (선택)'), '여유로운 핏')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(
      await screen.findByText('선택 이유 · 레이어드 균형이 더 좋아서 선택'),
    ).toBeInTheDocument()
    expect(screen.getByText('가지 · 여유로운 핏')).toBeInTheDocument()
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-edges:v1') ?? '[]',
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'edge-layer',
        decisionReason: '레이어드 균형이 더 좋아서 선택',
        branchName: '여유로운 핏',
      }),
    ])

    await user.click(
      screen.getByRole('link', { name: '아이보리 니트 Item 상세 보기' }),
    )
    expect(screen.getByText('Item 상세 도착')).toBeInTheDocument()
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
    await user.type(screen.getByLabelText('선택 이유'), '기존 로퍼 다음 운동화')
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
          decisionReason: '기존 로퍼 다음 운동화',
        }),
      ]),
    )
  })
})
