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
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId,
    transportModeId: 'transport-subway',
    observedHvacMode: 'off',
    observedHvacIntensity: null,
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
    const before = await repository.replacementLines.load()
    const source = before.lines.find((line) => line.id === 'line-navy-tee')!

    const target = await repository.replacementLines.moveItem({
      sourceLineId: source.id,
      itemId: 'item-tee',
      targetLineId: null,
      newLineName: 'Navy Summer Tee',
      newLineStyleIdentity: 'Summer Daily',
      expectedSourceUpdatedAt: source.updatedAt,
      expectedTargetUpdatedAt: null,
    })
    const after = await repository.replacementLines.load()
    const starts = await repository.replacementLines.loadStarts()

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
    const before = await repository.replacementLines.load()
    const source = before.lines.find((line) => line.id === 'line-navy-tee')!
    const target = before.lines.find((line) => line.id === 'line-soft-layer')!

    const merged = await repository.replacementLines.mergeLines({
      sourceLineId: source.id,
      targetLineId: target.id,
      expectedSourceUpdatedAt: source.updatedAt,
      expectedTargetUpdatedAt: target.updatedAt,
    })
    const after = await repository.replacementLines.load()
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
    const before = await repository.replacementLines.load()
    const source = before.lines.find((line) => line.id === 'line-blue-layer')!
    const target = before.lines.find((line) => line.id === 'line-soft-layer')!

    await repository.replacementLines.mergeLines({
      sourceLineId: source.id,
      targetLineId: target.id,
      expectedSourceUpdatedAt: source.updatedAt,
      expectedTargetUpdatedAt: target.updatedAt,
    })
    const after = await repository.replacementLines.load()
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
    const before = await repository.replacementLines.load()
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
          decisionReason: '대체 시도',
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
          decisionReason: '대체 시도',
          status: 'confirmed',
          confirmedAt: '2026-08-05T00:00:00Z',
          updatedAt: '2026-08-05T00:00:00Z',
        },
      ]),
    )

    await expect(
      repository.replacementLines.mergeLines({
        sourceLineId: source.id,
        targetLineId: target.id,
        expectedSourceUpdatedAt: source.updatedAt,
        expectedTargetUpdatedAt: target.updatedAt,
      }),
    ).rejects.toThrow('cycle')
    await expect(repository.replacementLines.load()).resolves.toEqual(before)
  })

  it('독립 Line을 보관하고 다시 활성화한다', async () => {
    const repository = new DemoRepository()
    const before = await repository.replacementLines.load()
    const line = before.lines.find((entry) => entry.id === 'line-future-dress')!

    const archived = await repository.replacementLines.setArchived({
      lineId: line.id,
      archived: true,
      expectedUpdatedAt: line.updatedAt,
    })
    expect(archived).toMatchObject({
      lifecycleStatus: 'archived',
      representativeLineId: null,
      archivedAt: expect.any(String),
    })

    const restored = await repository.replacementLines.setArchived({
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

  it('Line 없는 Item을 시작점으로 추가한 뒤 현재 Line에서 뺀다', async () => {
    const repository = new DemoRepository()
    const before = await repository.replacementLines.load()
    const line = before.lines.find((entry) => entry.id === 'line-navy-tee')!

    const addedLine = await repository.replacementLines.addItem({
      lineId: line.id,
      itemId: 'item-skirt',
      expectedUpdatedAt: line.updatedAt,
    })
    expect(addedLine).toMatchObject({ reviewStatus: 'needs_review' })
    await expect(repository.replacementLines.load()).resolves.toMatchObject({
      memberships: expect.arrayContaining([
        { replacementLineId: line.id, itemId: 'item-skirt' },
      ]),
    })
    await expect(repository.replacementLines.loadStarts()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          replacementLineId: line.id,
          itemId: 'item-skirt',
        }),
      ]),
    )

    await expect(
      repository.replacementLines.removeItem({
        sourceLineId: line.id,
        itemId: 'item-skirt',
        expectedSourceUpdatedAt: addedLine.updatedAt,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: line.id, reviewStatus: 'needs_review' }),
    ])
    const after = await repository.replacementLines.load()
    expect(
      after.memberships.some((membership) => membership.itemId === 'item-skirt'),
    ).toBe(false)
    expect(
      (await repository.replacementLines.loadStarts()).some(
        (start) => start.itemId === 'item-skirt',
      ),
    ).toBe(false)
  })

  it('중복 소속의 현재 Line만 빼고 다른 Line의 계보는 보존한다', async () => {
    const repository = new DemoRepository()
    const before = await repository.replacementLines.load()
    const duplicateLine = before.lines.find((line) => line.id === 'line-blue-layer')!
    const originalLine = before.lines.find((line) => line.id === 'line-soft-layer')!
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([
        {
          id: 'edge-original-line',
          replacementLineId: originalLine.id,
          predecessorItemId: 'item-cardigan',
          successorItemId: 'item-knit',
          sourceLegacyLinkId: null,
          sourceKind: 'manual',
          branchName: null,
          decisionReason: '대체 시도',
          status: 'confirmed',
          confirmedAt: '2026-08-05T00:00:00Z',
          updatedAt: '2026-08-05T00:00:00Z',
        },
      ]),
    )

    await expect(
      repository.replacementLines.removeItem({
        sourceLineId: duplicateLine.id,
        itemId: 'item-cardigan',
        expectedSourceUpdatedAt: duplicateLine.updatedAt,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: duplicateLine.id, reviewStatus: 'needs_review' }),
    ])

    const after = await repository.replacementLines.load()
    expect(after.memberships).not.toContainEqual({
      replacementLineId: duplicateLine.id,
      itemId: 'item-cardigan',
    })
    expect(after.memberships).toContainEqual({
      replacementLineId: originalLine.id,
      itemId: 'item-cardigan',
    })
    expect(
      JSON.parse(
        window.localStorage.getItem('closet-index-demo-lineage-edges:v1') ?? '[]',
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'edge-original-line',
        replacementLineId: originalLine.id,
      }),
    ])
    expect(after.lines.find((line) => line.id === originalLine.id)?.updatedAt).toBe(
      originalLine.updatedAt,
    )
  })
})

describe('DemoRepository Replacement Line creation', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('Item membership 없이 대표 색상이 지정된 빈 Line을 만든다', async () => {
    const repository = new DemoRepository()

    const created = await repository.replacementLines.create({
      name: '  Brown Bottom Spring  ',
      styleIdentity: '  Brown Bottom  ',
      colorCategory: 'Brown',
    })
    const snapshot = await repository.replacementLines.load()

    expect(created).toMatchObject({
      name: 'Brown Bottom Spring',
      styleIdentity: 'Brown Bottom',
      colorCategory: 'Brown',
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
    })
    expect(snapshot.lines).toContainEqual(created)
    expect(
      snapshot.memberships.filter(
        (membership) => membership.replacementLineId === created.id,
      ),
    ).toEqual([])
  })
})

describe('DemoRepository purchase event contract', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('재구매 기록과 저장 후 현재 수량을 함께 반영하고 멱등 재시도한다', async () => {
    const repository = new DemoRepository()
    const input = {
      id: 'purchase-event-one',
      itemId: 'item-tee',
      purchasedOn: '2026-07-20',
      quantity: 3,
      currentQuantity: 4,
    }

    const created = await repository.purchases.create(input)
    const repeated = await repository.purchases.create(input)
    const snapshot = await repository.load()

    expect(repeated.id).toBe(created.id)
    await expect(repository.purchases.load('item-tee')).resolves.toEqual([
      created,
    ])
    expect(
      snapshot.items.find((item) => item.id === 'item-tee')?.currentQuantity,
    ).toBe(4)
  })

  it('이력 수정·삭제는 현재 수량을 자동으로 바꾸지 않는다', async () => {
    const repository = new DemoRepository()
    const created = await repository.purchases.create({
      id: 'purchase-event-editable',
      itemId: 'item-tee',
      purchasedOn: '2026-07-20',
      quantity: 2,
      currentQuantity: 5,
    })

    const updated = await repository.purchases.update({
      eventId: created.id,
      purchasedOn: '2026-07-21',
      quantity: 1,
      expectedUpdatedAt: created.updatedAt,
    })
    await repository.purchases.delete({
      eventId: updated.id,
      expectedUpdatedAt: updated.updatedAt,
    })

    await expect(repository.purchases.load('item-tee')).resolves.toEqual([])
    expect(
      (await repository.load()).items.find((item) => item.id === 'item-tee')
        ?.currentQuantity,
    ).toBe(5)
  })

  it('현재 수량만 0·미입력으로 구분해 저장하고 이력은 만들지 않는다', async () => {
    const repository = new DemoRepository()

    await repository.purchases.setCurrentQuantity({
      itemId: 'item-tee',
      currentQuantity: 0,
    })
    expect(
      (await repository.load()).items.find((item) => item.id === 'item-tee')
        ?.currentQuantity,
    ).toBe(0)

    await repository.purchases.setCurrentQuantity({
      itemId: 'item-tee',
      currentQuantity: null,
    })
    expect(
      (await repository.load()).items.find((item) => item.id === 'item-tee')
        ?.currentQuantity,
    ).toBeNull()
    await expect(repository.purchases.load('item-tee')).resolves.toEqual([])
  })

  it('미래이거나 최초 구매일보다 앞선 재구매일을 거부한다', async () => {
    const repository = new DemoRepository()

    await expect(
      repository.purchases.create({
        id: 'purchase-event-future',
        itemId: 'item-tee',
        purchasedOn: '2999-01-01',
        quantity: 1,
        currentQuantity: 1,
      }),
    ).rejects.toThrow('미래')
    await expect(
      repository.purchases.create({
        id: 'purchase-event-before-acquired',
        itemId: 'item-tee',
        purchasedOn: '2026-06-14',
        quantity: 1,
        currentQuantity: 1,
      }),
    ).rejects.toThrow('최초 구매일')
  })
})
