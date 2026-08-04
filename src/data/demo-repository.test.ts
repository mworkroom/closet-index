import { beforeEach, describe, expect, it } from 'vitest'
import { DemoRepository } from './demo-repository'
import type { WearLogInput } from '../lib/types'

function input(submissionToken: string, placeId = 'place-library'): WearLogInput {
  return {
    outfitId: 'outfit-favorite',
    wornOn: '2026-07-26',
    tempOut: 20,
    tempBack: null,
    tempBackInferred: true,
    feelingOut: 'ok',
    feelingBack: null,
    rainCondition: 'unknown',
    longWalkCondition: 'unknown',
    placeId,
    transportModeId: 'transport-subway',
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken,
  }
}

describe('DemoRepository wear log contract', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('같은 날짜와 같은 Outfit도 서로 다른 제출이면 별도 기록한다', async () => {
    const repository = new DemoRepository()

    const first = await repository.createWearLog(input('token-a'))
    const second = await repository.createWearLog(input('token-b', 'place-cgv'))
    const data = await repository.load()
    const created = data.wearLogs.filter(
      (log) =>
        log.wornOn === '2026-07-26' && log.outfitId === 'outfit-favorite',
    )

    expect(created).toHaveLength(2)
    expect(first.id).not.toBe(second.id)
    expect(created.map((log) => log.placeId)).toEqual([
      'place-library',
      'place-cgv',
    ])
  })

  it('Item 이미지 있음·없음·오류 demo fixture를 함께 제공한다', async () => {
    const data = await new DemoRepository().load()

    expect(
      data.items.find((item) => item.id === 'item-cardigan')?.image?.url,
    ).toMatch(/^data:image\/svg\+xml/)
    expect(data.items.find((item) => item.id === 'item-knit')?.image).toBeNull()
    expect(
      data.items.find((item) => item.id === 'item-tee')?.image?.url,
    ).toContain('broken-image-fixture')
  })

  it('같은 폼의 동일 제출 토큰만 멱등 처리한다', async () => {
    const repository = new DemoRepository()

    const first = await repository.createWearLog(input('same-token'))
    const repeated = await repository.createWearLog(input('same-token'))
    const data = await repository.load()

    expect(repeated.id).toBe(first.id)
    expect(
      data.wearLogs.filter((log) => log.submissionToken === 'same-token'),
    ).toHaveLength(1)
  })

  it('기록 수정과 삭제 후 계산 원본이 함께 바뀐다', async () => {
    const repository = new DemoRepository()
    const created = await repository.createWearLog(input('editable-token'))

    await repository.updateWearLog(created.id, {
      ...input('editable-token'),
      tempBack: 18,
      tempBackInferred: false,
      memo: '수정됨',
    })
    let data = await repository.load()
    expect(data.wearLogs.find((log) => log.id === created.id)).toMatchObject({
      tempBack: 18,
      tempBackInferred: false,
      memo: '수정됨',
    })

    await repository.deleteWearLog(created.id)
    data = await repository.load()
    expect(data.wearLogs.some((log) => log.id === created.id)).toBe(false)
  })

  it('기상 예보 출처와 직접 수정 여부를 함께 저장한다', async () => {
    const repository = new DemoRepository()
    const created = await repository.createWearLog({
      ...input('weather-token'),
      temperatureSource: 'weather',
      weatherLocationId: 'weather-location-chang-4-dong',
      weatherIssuedAt: '2026-07-29T05:00:00+09:00',
      weatherOverridden: true,
    })

    expect(created).toMatchObject({
      temperatureSource: 'weather',
      weatherLocationId: 'weather-location-chang-4-dong',
      weatherIssuedAt: '2026-07-29T05:00:00+09:00',
      weatherOverridden: true,
    })
  })

  it('Outfit 구성 아이템의 표시 방식·위치·크기를 저장한다', async () => {
    const repository = new DemoRepository()

    await repository.updateOutfitItemPlacement({
      outfitId: 'outfit-favorite',
      itemId: 'item-pants',
      slot: 'top',
      positionX: 0,
      positionY: -40,
      itemScale: 1.1,
      zIndex: 0,
    })

    const data = await repository.load()
    expect(
      data.outfits
        .find((outfit) => outfit.id === 'outfit-favorite')
        ?.itemPlacements?.find((placement) => placement.itemId === 'item-pants'),
    ).toMatchObject({
      slot: 'top',
      positionX: 0,
      positionY: -40,
      itemScale: 1.1,
      zIndex: 0,
    })
  })

  it('기본 기상 위치를 저장하고 다시 불러온다', async () => {
    const repository = new DemoRepository()
    const current = (await repository.load()).weatherLocations?.find(
      (location) => location.isDefault,
    )

    await repository.saveDefaultWeatherLocation({
      id: current?.id,
      label: '창5동',
      officialName: '서울특별시 도봉구 창제5동',
      adminCode: '1132051500',
      nx: 61,
      ny: 129,
    })

    const saved = (await repository.load()).weatherLocations?.find(
      (location) => location.isDefault,
    )
    expect(saved).toMatchObject({
      id: current?.id,
      label: '창5동',
      officialName: '서울특별시 도봉구 창제5동',
      adminCode: '1132051500',
      nx: 61,
      ny: 129,
      isDefault: true,
    })
  })

  it('연결 전 Item을 새 Line으로 옮기고 양쪽 Line을 재검토 상태로 저장한다', async () => {
    const repository = new DemoRepository()
    const before = await repository.loadReplacementLines()
    const source = before.lines.find((line) => line.id === 'line-navy-tee')!

    const target = await repository.moveReplacementLineItem({
      sourceLineId: source.id,
      itemId: 'item-tee',
      targetLineId: null,
      newLineName: 'Navy Summer Tee',
      newLineStyleIdentity: 'Summer Daily',
      expectedSourceUpdatedAt: source.updatedAt,
      expectedTargetUpdatedAt: null,
    })
    const after = await repository.loadReplacementLines()
    const starts = await repository.loadReplacementLineStarts()

    expect(target).toMatchObject({
      name: 'Navy Summer Tee',
      styleIdentity: 'Summer Daily',
      reviewStatus: 'needs_review',
    })
    expect(after.lines.find((line) => line.id === source.id)?.reviewStatus).toBe(
      'needs_review',
    )
    expect(after.memberships).toContainEqual({
      replacementLineId: target.id,
      itemId: 'item-tee',
    })
    expect(after.memberships).not.toContainEqual({
      replacementLineId: source.id,
      itemId: 'item-tee',
    })
    expect(starts).toContainEqual(
      expect.objectContaining({ replacementLineId: target.id, itemId: 'item-tee' }),
    )
  })

  it('Line을 대표 Line으로 병합하고 원본 Line을 보관한다', async () => {
    const repository = new DemoRepository()
    const before = await repository.loadReplacementLines()
    const source = before.lines.find((line) => line.id === 'line-navy-tee')!
    const target = before.lines.find((line) => line.id === 'line-soft-layer')!

    const merged = await repository.mergeReplacementLines({
      sourceLineId: source.id,
      targetLineId: target.id,
      expectedSourceUpdatedAt: source.updatedAt,
      expectedTargetUpdatedAt: target.updatedAt,
    })
    const after = await repository.loadReplacementLines()
    const archivedSource = after.lines.find((line) => line.id === source.id)

    expect(merged).toMatchObject({
      id: target.id,
      lifecycleStatus: 'active',
      reviewStatus: 'needs_review',
    })
    expect(archivedSource).toMatchObject({
      lifecycleStatus: 'archived',
      representativeLineId: target.id,
      reviewStatus: 'needs_review',
      archivedAt: expect.any(String),
    })
    expect(after.memberships).toContainEqual({
      replacementLineId: target.id,
      itemId: 'item-tee',
    })
    expect(after.memberships).not.toContainEqual({
      replacementLineId: source.id,
      itemId: 'item-tee',
    })
  })

  it('겹치는 membership은 대표 Line에 하나씩만 남긴다', async () => {
    const repository = new DemoRepository()
    const before = await repository.loadReplacementLines()
    const source = before.lines.find((line) => line.id === 'line-blue-layer')!
    const target = before.lines.find((line) => line.id === 'line-soft-layer')!

    await repository.mergeReplacementLines({
      sourceLineId: source.id,
      targetLineId: target.id,
      expectedSourceUpdatedAt: source.updatedAt,
      expectedTargetUpdatedAt: target.updatedAt,
    })
    const after = await repository.loadReplacementLines()
    const targetMemberships = after.memberships.filter(
      (membership) => membership.replacementLineId === target.id,
    )

    expect(targetMemberships).toEqual([
      { replacementLineId: target.id, itemId: 'item-cardigan' },
      { replacementLineId: target.id, itemId: 'item-knit' },
    ])
    expect(
      after.memberships.some(
        (membership) => membership.replacementLineId === source.id,
      ),
    ).toBe(false)
  })

  it('두 Line을 합쳤을 때 cycle이 생기면 아무것도 저장하지 않는다', async () => {
    const repository = new DemoRepository()
    const before = await repository.loadReplacementLines()
    const source = before.lines.find((line) => line.id === 'line-blue-layer')!
    const target = before.lines.find((line) => line.id === 'line-soft-layer')!
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([
        {
          id: 'edge-forward',
          replacementLineId: target.id,
          predecessorItemId: 'item-cardigan',
          successorItemId: 'item-knit',
          sourceLegacyLinkId: null,
          sourceKind: 'manual',
          branchName: null,
          decisionReason: '단순 교체',
          status: 'confirmed',
          confirmedAt: '2026-08-05T00:00:00Z',
          updatedAt: '2026-08-05T00:00:00Z',
        },
        {
          id: 'edge-reverse',
          replacementLineId: source.id,
          predecessorItemId: 'item-knit',
          successorItemId: 'item-cardigan',
          sourceLegacyLinkId: null,
          sourceKind: 'manual',
          branchName: null,
          decisionReason: '단순 교체',
          status: 'confirmed',
          confirmedAt: '2026-08-05T00:00:00Z',
          updatedAt: '2026-08-05T00:00:00Z',
        },
      ]),
    )

    await expect(
      repository.mergeReplacementLines({
        sourceLineId: source.id,
        targetLineId: target.id,
        expectedSourceUpdatedAt: source.updatedAt,
        expectedTargetUpdatedAt: target.updatedAt,
      }),
    ).rejects.toThrow('cycle')
    await expect(repository.loadReplacementLines()).resolves.toEqual(before)
  })

  it('독립 Line을 보관하고 다시 활성화한다', async () => {
    const repository = new DemoRepository()
    const before = await repository.loadReplacementLines()
    const line = before.lines.find((entry) => entry.id === 'line-future-dress')!

    const archived = await repository.setReplacementLineArchived({
      lineId: line.id,
      archived: true,
      expectedUpdatedAt: line.updatedAt,
    })
    expect(archived).toMatchObject({
      lifecycleStatus: 'archived',
      representativeLineId: null,
      archivedAt: expect.any(String),
    })

    const restored = await repository.setReplacementLineArchived({
      lineId: line.id,
      archived: false,
      expectedUpdatedAt: archived.updatedAt,
    })
    expect(restored).toMatchObject({
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
    })
  })
})
