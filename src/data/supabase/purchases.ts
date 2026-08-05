import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CurrentQuantityUpdateInput,
  PurchaseEvent,
  PurchaseEventCreateInput,
  PurchaseEventDeleteInput,
  PurchaseEventUpdateInput,
} from '../../lib/types'
import type { PurchaseRepository } from '../purchase-repository'

interface PurchaseEventRow {
  id: string
  item_id: string
  purchased_on: string
  quantity: number
  created_at: string
  updated_at: string
}

const PURCHASE_EVENT_SELECTION =
  'id,item_id,purchased_on,quantity,created_at,updated_at'

function toPurchaseEvent(row: PurchaseEventRow): PurchaseEvent {
  return {
    id: row.id,
    itemId: row.item_id,
    purchasedOn: row.purchased_on,
    quantity: row.quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SupabasePurchaseRepository implements PurchaseRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async load(itemId: string): Promise<PurchaseEvent[]> {
    const { data, error } = await this.client
      .from('closet_purchase_events')
      .select(PURCHASE_EVENT_SELECTION)
      .eq('workspace_id', this.workspaceId)
      .eq('item_id', itemId)
      .order('purchased_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (error) throw error
    return ((data ?? []) as PurchaseEventRow[]).map(toPurchaseEvent)
  }

  async loadForItems(itemIds: readonly string[]): Promise<PurchaseEvent[]> {
    if (itemIds.length === 0) return []
    const { data, error } = await this.client
      .from('closet_purchase_events')
      .select(PURCHASE_EVENT_SELECTION)
      .eq('workspace_id', this.workspaceId)
      .in('item_id', [...new Set(itemIds)])
      .order('purchased_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (error) throw error
    return ((data ?? []) as PurchaseEventRow[]).map(toPurchaseEvent)
  }

  async create(input: PurchaseEventCreateInput): Promise<PurchaseEvent> {
    const { data, error } = await this.client.rpc(
      'create_closet_purchase_event',
      {
        p_workspace_id: this.workspaceId,
        p_event_id: input.id,
        p_item_id: input.itemId,
        p_purchased_on: input.purchasedOn,
        p_quantity: input.quantity,
        p_current_quantity: input.currentQuantity,
      },
    )
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as
      | PurchaseEventRow
      | null
    if (!row) throw new Error('저장한 재구매 기록을 확인하지 못했습니다.')
    return toPurchaseEvent(row)
  }

  async update(input: PurchaseEventUpdateInput): Promise<PurchaseEvent> {
    const { data, error } = await this.client
      .from('closet_purchase_events')
      .update({
        purchased_on: input.purchasedOn,
        quantity: input.quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', this.workspaceId)
      .eq('id', input.eventId)
      .eq('updated_at', input.expectedUpdatedAt)
      .select(PURCHASE_EVENT_SELECTION)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw new Error('재구매 기록이 변경되었습니다. 다시 불러와 주세요.')
    }
    return toPurchaseEvent(data as PurchaseEventRow)
  }

  async delete(input: PurchaseEventDeleteInput): Promise<void> {
    const { data, error } = await this.client
      .from('closet_purchase_events')
      .delete()
      .eq('workspace_id', this.workspaceId)
      .eq('id', input.eventId)
      .eq('updated_at', input.expectedUpdatedAt)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw new Error('재구매 기록이 변경되었습니다. 다시 불러와 주세요.')
    }
  }

  async setCurrentQuantity(
    input: CurrentQuantityUpdateInput,
  ): Promise<number | null> {
    const { data, error } = await this.client
      .from('closet_items')
      .update({
        current_quantity: input.currentQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', this.workspaceId)
      .eq('id', input.itemId)
      .select('current_quantity')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Item을 찾을 수 없습니다.')
    return data.current_quantity as number | null
  }
}
