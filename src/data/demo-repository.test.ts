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

  it('이미지 있음·없음·오류 demo fixture를 함께 제공한다', async () => {
    const data = await new DemoRepository().load()

    expect(
      data.items.find((item) => item.id === 'item-cardigan')?.image?.url,
    ).toMatch(/^data:image\/svg\+xml/)
    expect(data.items.find((item) => item.id === 'item-knit')?.image).toBeNull()
    expect(
      data.items.find((item) => item.id === 'item-tee')?.image?.url,
    ).toContain('broken-image-fixture')
    expect(
      data.outfits.find((outfit) => outfit.id === 'outfit-favorite')?.preview
        ?.compositionVersion,
    ).toBe(1)
    expect(
      data.outfits.find((outfit) => outfit.id === 'outfit-summer')?.preview,
    ).toBeNull()
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

  it('Outfit 구성 아이템의 위치만 저장한다', async () => {
    const repository = new DemoRepository()

    await repository.updateOutfitItemPosition({
      outfitId: 'outfit-favorite',
      itemId: 'item-pants',
      positionX: 0,
      positionY: -40,
    })

    const data = await repository.load()
    expect(
      data.outfits
        .find((outfit) => outfit.id === 'outfit-favorite')
        ?.itemPlacements?.find((placement) => placement.itemId === 'item-pants'),
    ).toMatchObject({
      positionX: 0,
      positionY: -40,
      itemScale: null,
      zIndex: null,
    })
  })
})
