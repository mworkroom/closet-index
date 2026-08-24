import { beforeEach, describe, expect, it } from 'vitest'
import type { ItemCreateInput } from '../lib/types'
import { DemoRepository } from './demo-repository'

function itemInput(id = 'item-phase3'): ItemCreateInput {
  return {
    id,
    name: ' 새 재킷 ',
    category: 'Outer-Jacket',
    semanticColor: 'Navy',
    paletteId: null,
    displayHex: '#293a5b',
    seasons: ['Spring', 'Fall'],
    rainOk: true,
    longWalkOk: true,
    memo: ' 테스트 Item ',
    acquiredOn: '2026-07-29',
  }
}

describe('DemoRepository Phase 3 writes', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('새 Item을 같은 UUID 재시도에서도 한 번만 만든다', async () => {
    const repository = new DemoRepository()

    const first = await repository.createItem(itemInput())
    const repeated = await repository.createItem(itemInput())
    const data = await repository.load()

    expect(first).toMatchObject({
      id: 'item-phase3',
      name: '새 재킷',
      displayHex: '#293A5B',
      retired: false,
      image: null,
    })
    expect(repeated.id).toBe(first.id)
    expect(data.items.filter((item) => item.id === first.id)).toHaveLength(1)
  })

  it('동일 Item 조합은 확인 전 차단하고 승인 뒤 새 Outfit으로 저장한다', async () => {
    const repository = new DemoRepository()
    const items = [
      {
        itemId: 'item-cardigan',
        slot: 'outer',
        sortOrder: 0,
        positionX: 0,
        positionY: -52,
        itemScale: 0.9,
        zIndex: 30,
      },
      {
        itemId: 'item-knit',
        slot: 'top',
        sortOrder: 1,
        positionX: 0,
        positionY: 0,
        itemScale: 0.9,
        zIndex: 20,
      },
      {
        itemId: 'item-pants',
        slot: 'bottom',
        sortOrder: 2,
        positionX: 0,
        positionY: 0,
        itemScale: 0.9,
        zIndex: 10,
      },
      {
        itemId: 'item-shoes',
        slot: 'shoes',
        sortOrder: 3,
        positionX: 0,
        positionY: 0,
        itemScale: 0.8,
        zIndex: 40,
      },
    ]

    await expect(
      repository.createOutfit({
        id: 'outfit-duplicate-blocked',
        displayName: '중복 조합',
        items,
        allowDuplicate: false,
      }),
    ).rejects.toThrow('같은 Item 조합')

    const created = await repository.createOutfit({
      id: 'outfit-duplicate-confirmed',
      displayName: '중복 확인 완료',
      items,
      allowDuplicate: true,
    })

    expect(created).toMatchObject({
      id: 'outfit-duplicate-confirmed',
      rating: 'ok',
      archivedAt: null,
      itemIds: items.map((item) => item.itemId),
    })
  })

  it('Outfit 보관은 relation과 평가를 바꾸지 않는다', async () => {
    const repository = new DemoRepository()
    const outfitBefore = structuredClone(
      (await repository.load()).outfits.find(
        (outfit) => outfit.id === 'outfit-favorite',
      ),
    )
    if (outfitBefore) outfitBefore.archivedAt ??= null

    await repository.setOutfitArchived('outfit-favorite', true)

    const data = await repository.load()
    expect(
      data.outfits.find((outfit) => outfit.id === 'outfit-favorite'),
    ).toEqual({
      ...outfitBefore,
      archivedAt: expect.any(String),
    })
  })

  it('연결된 기록은 보호하고 미연결 Item과 미착용 Outfit만 삭제한다', async () => {
    const repository = new DemoRepository()
    await repository.createItem(itemInput('item-unlinked'))
    await repository.createOutfit({
      id: 'outfit-unworn',
      displayName: '미착용 착장',
      items: [
        {
          itemId: 'item-cardigan',
          slot: 'outer',
          sortOrder: 0,
          positionX: 0,
          positionY: 0,
          itemScale: 1,
          zIndex: 10,
        },
      ],
      allowDuplicate: true,
    })

    await expect(repository.deleteItem('item-cardigan')).rejects.toThrow(
      '포함된 Outfit',
    )
    await expect(repository.deleteOutfit('outfit-favorite')).rejects.toThrow(
      '착용 기록',
    )

    await repository.deleteItem('item-unlinked')
    await repository.deleteOutfit('outfit-unworn')
    const data = await repository.load()

    expect(data.items.some((item) => item.id === 'item-unlinked')).toBe(false)
    expect(data.outfits.some((outfit) => outfit.id === 'outfit-unworn')).toBe(false)
  })
})
