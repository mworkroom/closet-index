import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CareEvent,
  CareEventCreateInput,
  CareEventDeleteInput,
  CareEventUpdateInput,
  CareMethod,
} from '../../lib/types'
import type { CareRepository } from '../care-repository'

interface CareEventRow {
  id: string
  item_id: string
  cared_on: string
  care_method: CareMethod
  created_at: string
  updated_at: string
}

const CARE_EVENT_SELECTION =
  'id,item_id,cared_on,care_method,created_at,updated_at'

function toCareEvent(row: CareEventRow): CareEvent {
  return {
    id: row.id,
    itemId: row.item_id,
    caredOn: row.cared_on,
    method: row.care_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SupabaseCareRepository implements CareRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  private async loadQuery(itemIds: readonly string[]) {
    if (itemIds.length === 0) return []
    const { data, error } = await this.client
      .from('closet_care_events')
      .select(CARE_EVENT_SELECTION)
      .eq('workspace_id', this.workspaceId)
      .in('item_id', [...new Set(itemIds)])
      .order('cared_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (error) throw error
    return ((data ?? []) as CareEventRow[]).map(toCareEvent)
  }

  load(itemId: string) {
    return this.loadQuery([itemId])
  }

  loadForItems(itemIds: readonly string[]) {
    return this.loadQuery(itemIds)
  }

  async create(input: CareEventCreateInput): Promise<CareEvent> {
    const { data, error } = await this.client
      .from('closet_care_events')
      .insert({
        id: input.id,
        workspace_id: this.workspaceId,
        item_id: input.itemId,
        cared_on: input.caredOn,
        care_method: input.method,
      })
      .select(CARE_EVENT_SELECTION)
      .single()

    if (error) throw error
    return toCareEvent(data as CareEventRow)
  }

  async update(input: CareEventUpdateInput): Promise<CareEvent> {
    const { data, error } = await this.client
      .from('closet_care_events')
      .update({ cared_on: input.caredOn, care_method: input.method })
      .eq('workspace_id', this.workspaceId)
      .eq('id', input.eventId)
      .eq('updated_at', input.expectedUpdatedAt)
      .select(CARE_EVENT_SELECTION)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('관리 기록이 변경되었습니다. 다시 불러와 주세요.')
    return toCareEvent(data as CareEventRow)
  }

  async delete(input: CareEventDeleteInput): Promise<void> {
    const { data, error } = await this.client
      .from('closet_care_events')
      .delete()
      .eq('workspace_id', this.workspaceId)
      .eq('id', input.eventId)
      .eq('updated_at', input.expectedUpdatedAt)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('관리 기록이 변경되었습니다. 다시 불러와 주세요.')
  }
}
