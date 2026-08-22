import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { DemoRepository } from '../data/demo-repository'
import { OutfitCreatorPage } from './OutfitCreatorPage'

function renderCreator(
  repository: DemoRepository,
  initialEntry = '/outfits/new',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SeasonScopeProvider>
        <DataProvider repository={repository}>
          <Routes>
            <Route path="/outfits/new" element={<OutfitCreatorPage />} />
            <Route path="/outfits/:outfitId/edit" element={<OutfitCreatorPage />} />
            <Route path="/outfits/:outfitId" element={<p>저장 완료</p>} />
          </Routes>
        </DataProvider>
      </SeasonScopeProvider>
    </MemoryRouter>,
  )
}

describe('Outfit creator', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('이미지 유무가 섞인 Item과 배치값을 새 Outfit으로 한 번에 저장한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const createOutfit = vi.spyOn(repository, 'createOutfit')

    renderCreator(repository)

    expect(await screen.findByRole('button', { name: 'Top' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Outer' }))
    await user.click(
      await screen.findByRole('button', { name: '블루 가디건 추가' }),
    )
    await user.click(screen.getByRole('button', { name: 'Top' }))
    await user.click(screen.getByRole('button', { name: '아이보리 니트 추가' }))
    expect(screen.getByText('평가 OK')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '미입력' })).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: '블루 가디건 오른쪽으로 4px 이동' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Outfit 이름 (선택)' }),
      '새 레이어드 착장',
    )
    await user.click(screen.getByRole('button', { name: '새 Outfit 저장' }))

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    expect(createOutfit).toHaveBeenCalledTimes(1)
    expect(createOutfit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        displayName: '새 레이어드 착장',
        allowDuplicate: false,
        items: [
          expect.objectContaining({
            itemId: 'item-cardigan',
            sortOrder: 0,
            positionX: expect.any(Number),
          }),
          expect.objectContaining({
            itemId: 'item-knit',
            sortOrder: 1,
            positionX: expect.any(Number),
          }),
        ],
      }),
    )
  })

  it('같은 Item 조합은 기존 Outfit을 먼저 안내하고 확인 뒤에만 저장한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const createOutfit = vi.spyOn(repository, 'createOutfit')

    renderCreator(repository)

    await user.click(await screen.findByRole('button', { name: 'Top' }))
    await user.click(
      await screen.findByRole('button', { name: '아이보리 니트 추가' }),
    )
    await user.click(screen.getByRole('button', { name: 'Bottom' }))
    await user.click(screen.getByRole('button', { name: '블랙 팬츠 추가' }))
    await user.click(screen.getByRole('button', { name: '새 Outfit 저장' }))

    expect(
      await screen.findByText('같은 Item 조합의 Outfit이 이미 있습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByText('아직 평가하지 않은 조합')).toBeInTheDocument()
    expect(createOutfit).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: '같은 조합으로 별도 저장' }),
    )

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    expect(createOutfit).toHaveBeenCalledTimes(1)
    expect(createOutfit).toHaveBeenCalledWith(
      expect.objectContaining({ allowDuplicate: true }),
    )
  })

  it('독립 Innerwear는 숨기고 Socks는 Acc에서 선택할 수 있다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    await repository.createItem({
      id: 'item-innerwear-only',
      name: '테스트 이너웨어',
      category: 'Innerwear',
      semanticColor: 'White',
      paletteId: null,
      displayHex: '#FFFFFF',
      seasons: ['Spring'],
      rainOk: true,
      longWalkOk: true,
      memo: null,
      acquiredOn: null,
    })
    await repository.createItem({
      id: 'item-socks-test',
      name: '테스트 양말',
      category: 'Socks',
      semanticColor: 'Black',
      paletteId: null,
      displayHex: '#111111',
      seasons: ['Spring'],
      rainOk: true,
      longWalkOk: true,
      memo: null,
      acquiredOn: null,
    })

    renderCreator(repository)

    await user.click(await screen.findByRole('button', { name: 'Acc' }))
    expect(
      await screen.findByRole('button', { name: '테스트 양말 추가' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '테스트 이너웨어 추가' }),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: '테스트 양말 추가' }),
    ).toBeInTheDocument()
  })

  it('원본 Outfit의 Item과 placement를 초안으로 복사하고 새 UUID로 저장한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const createOutfit = vi.spyOn(repository, 'createOutfit')
    await repository.updateOutfitItemPlacement({
      outfitId: 'outfit-favorite',
      itemId: 'item-cardigan',
      slot: 'outer',
      positionX: 12,
      positionY: -48,
      itemScale: 0.95,
      zIndex: 60,
    })
    const sourceBefore = structuredClone(
      (await repository.load()).outfits.find(
        (outfit) => outfit.id === 'outfit-favorite',
      ),
    )
    if (sourceBefore) sourceBefore.archivedAt ??= null

    renderCreator(repository, '/outfits/new?source=outfit-favorite')

    expect(
      await screen.findByText('원본 Outfit에서 복제 중'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('4개')).toHaveLength(2)
    await user.click(
      screen.getAllByRole('button', { name: '블랙 팬츠 선택 해제' })[0],
    )
    await user.click(screen.getByRole('button', { name: '새 Outfit 저장' }))

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    expect(createOutfit).toHaveBeenCalledTimes(1)
    expect(createOutfit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.not.stringMatching(/^outfit-favorite$/),
        allowDuplicate: false,
        items: expect.not.arrayContaining([
          expect.objectContaining({ itemId: 'item-pants' }),
        ]),
      }),
    )
    const sourceCardiganPlacement = sourceBefore?.itemPlacements?.find(
      (placement) => placement.itemId === 'item-cardigan',
    )
    if (!sourceCardiganPlacement) throw new Error('source placement missing')
    expect(createOutfit.mock.calls[0][0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'item-cardigan',
          slot: sourceCardiganPlacement.slot,
          positionX: sourceCardiganPlacement.positionX,
          positionY: sourceCardiganPlacement.positionY,
          itemScale: sourceCardiganPlacement.itemScale,
          zIndex: sourceCardiganPlacement.zIndex,
        }),
      ]),
    )
    expect(
      (await repository.load()).outfits.find(
        (outfit) => outfit.id === 'outfit-favorite',
      ),
    ).toEqual(sourceBefore)
  })

  it('Item 상세에서 시작하면 해당 Item을 새 Outfit 초안에 미리 선택한다', async () => {
    const repository = new DemoRepository()

    renderCreator(repository, '/outfits/new?item=item-cardigan')

    expect(
      (await screen.findAllByRole('button', {
        name: '블루 가디건 선택 해제',
      })).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Outer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const selectedSection = screen
      .getByRole('heading', { name: '현재 선택' })
      .closest('section')
    expect(selectedSection).not.toBeNull()
    expect(within(selectedSection as HTMLElement).getByText('1개')).toBeInTheDocument()
  })

  it('기존 Outfit에서 Item을 빼고 같은 ID로 수정한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const updateOutfit = vi.spyOn(repository, 'updateOutfit')
    const createOutfit = vi.spyOn(repository, 'createOutfit')

    renderCreator(repository, '/outfits/outfit-favorite/edit')

    expect(await screen.findByRole('heading', { name: 'Edit Outfit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Favorite' })).toBeChecked()
    })
    expect(screen.queryByRole('radio', { name: '미입력' })).not.toBeInTheDocument()
    expect(screen.getByText('평가 Favorite')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Error' }))
    expect(screen.getByText('평가 Error')).toBeInTheDocument()
    await user.click(
      (await screen.findAllByRole('button', { name: '블랙 팬츠 선택 해제' }))[0],
    )
    await user.click(screen.getByRole('button', { name: '변경 저장' }))

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    expect(createOutfit).not.toHaveBeenCalled()
    expect(updateOutfit).toHaveBeenCalledWith(
      'outfit-favorite',
      expect.objectContaining({
        rating: 'error',
        allowDuplicate: false,
        items: expect.not.arrayContaining([
          expect.objectContaining({ itemId: 'item-pants' }),
        ]),
      }),
    )
    const savedOutfit = (await repository.load()).outfits.find(
      (outfit) => outfit.id === 'outfit-favorite',
    )
    expect(savedOutfit?.itemIds).not.toContain('item-pants')
    expect(savedOutfit?.rating).toBe('error')
  })

  it('실시간 미리보기 없이 배치 조정을 Item 추가 목록보다 먼저 표시한다', async () => {
    const repository = new DemoRepository()

    renderCreator(repository, '/outfits/outfit-favorite/edit')

    const placementHeading = await screen.findByRole('heading', {
      name: 'Item별 배치 조정',
    })
    const itemAddHeading = screen.getByRole('heading', { name: 'Item 추가' })
    expect(
      screen.queryByRole('heading', { name: '실시간 미리보기' }),
    ).not.toBeInTheDocument()
    expect(
      placementHeading.compareDocumentPosition(itemAddHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '변경 저장' })).toHaveClass(
      'button--primary',
    )
    expect(
      screen.getByRole('button', { name: '변경 저장' }).parentElement,
    ).toHaveClass('outfit-creator__fixed-save')
  })
})
