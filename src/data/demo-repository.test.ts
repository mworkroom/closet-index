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
})
