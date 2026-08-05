import { beforeEach, describe, expect, it } from 'vitest'
import { DemoRepository } from './demo-repository'

describe('DemoRepository P6-4 care events', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('과거 관리 이력을 생성·수정·삭제하고 미래 날짜를 막는다', async () => {
    const repository = new DemoRepository()
    const created = await repository.care.create({
      id: 'care-1',
      itemId: 'item-knit',
      caredOn: '2026-08-01',
      method: 'dry_cleaning',
    })
    const updated = await repository.care.update({
      eventId: created.id,
      caredOn: '2026-07-31',
      method: 'hand_wash',
      expectedUpdatedAt: created.updatedAt,
    })

    expect(updated).toMatchObject({ caredOn: '2026-07-31', method: 'hand_wash' })
    await expect(
      repository.care.create({
        id: 'future-care',
        itemId: 'item-knit',
        caredOn: '2999-01-01',
        method: 'dry_cleaning',
      }),
    ).rejects.toThrow('미래 날짜')

    await repository.care.delete({
      eventId: updated.id,
      expectedUpdatedAt: updated.updatedAt,
    })
    await expect(repository.care.load('item-knit')).resolves.toEqual([])
  })

  it('Item 삭제 시 로컬 관리 사건도 함께 제거한다', async () => {
    const repository = new DemoRepository()
    await repository.care.create({
      id: 'care-1',
      itemId: 'item-belt',
      caredOn: '2026-08-01',
      method: 'hand_wash',
    })
    await repository.deleteItem('item-belt')
    await expect(repository.care.load('item-belt')).resolves.toEqual([])
  })
})
