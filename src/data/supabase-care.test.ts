import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseRepository } from './supabase-repository'

const row = {
  id: 'care-1',
  item_id: 'item-1',
  cared_on: '2026-08-01',
  care_method: 'dry_cleaning',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

function builderWithTerminal(terminal: 'single' | 'maybeSingle', data: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['insert', 'update', 'delete', 'select', 'eq']) {
    builder[method] = vi.fn(() => builder)
  }
  builder[terminal] = vi.fn(async () => ({ data, error: null }))
  return builder
}

describe('SupabaseRepository P6-4 care events', () => {
  it('현재 화면 Item ID들을 한 query로 일괄 조회한다', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['select', 'eq', 'in', 'order']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.then = vi.fn((resolve) => resolve({ data: [row], error: null }))
    const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace-1')

    const events = await repository.care.loadForItems(['item-1', 'item-2'])

    expect(client.from).toHaveBeenCalledWith('closet_care_events')
    expect(builder.eq).toHaveBeenCalledWith('workspace_id', 'workspace-1')
    expect(builder.in).toHaveBeenCalledWith('item_id', ['item-1', 'item-2'])
    expect(events[0]).toMatchObject({
      id: 'care-1',
      itemId: 'item-1',
      caredOn: '2026-08-01',
      method: 'dry_cleaning',
    })
  })

  it('관리 사건 생성은 RLS 대상 테이블에 workspace와 당시 방식을 직접 저장한다', async () => {
    const builder = builderWithTerminal('single', row)
    const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace-1')

    await repository.care.create({
      id: 'care-1',
      itemId: 'item-1',
      caredOn: '2026-08-01',
      method: 'dry_cleaning',
    })

    expect(builder.insert).toHaveBeenCalledWith({
      id: 'care-1',
      workspace_id: 'workspace-1',
      item_id: 'item-1',
      cared_on: '2026-08-01',
      care_method: 'dry_cleaning',
    })
  })

  it('수정과 삭제는 updated_at 낙관적 잠금 경계를 사용한다', async () => {
    const updateBuilder = builderWithTerminal('maybeSingle', {
      ...row,
      care_method: 'hand_wash',
      updated_at: '2026-08-02T00:00:00Z',
    })
    const deleteBuilder = builderWithTerminal('maybeSingle', { id: 'care-1' })
    const from = vi
      .fn()
      .mockReturnValueOnce(updateBuilder)
      .mockReturnValueOnce(deleteBuilder)
    const repository = new SupabaseRepository(
      { from } as unknown as SupabaseClient,
      'workspace-1',
    )

    await repository.care.update({
      eventId: 'care-1',
      caredOn: '2026-08-01',
      method: 'hand_wash',
      expectedUpdatedAt: row.updated_at,
    })
    await repository.care.delete({
      eventId: 'care-1',
      expectedUpdatedAt: '2026-08-02T00:00:00Z',
    })

    expect(updateBuilder.eq).toHaveBeenCalledWith('updated_at', row.updated_at)
    expect(deleteBuilder.eq).toHaveBeenCalledWith(
      'updated_at',
      '2026-08-02T00:00:00Z',
    )
  })
})
