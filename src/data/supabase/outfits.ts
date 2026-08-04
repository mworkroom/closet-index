import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MatchingOutfit,
  Outfit,
  OutfitCloneInput,
  OutfitCreateInput,
  OutfitUpdateInput,
  OutfitItemPlacementInput,
} from '../../lib/types'
import {
  collectAllPages,
  nullableNumericValue,
  type OutfitItemRow,
  type OutfitRow,
  toOutfitItemWriteRow,
} from './shared'

export class SupabaseOutfitRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async findMatching(itemIds: string[]): Promise<MatchingOutfit[]> {
    const { data, error } = await this.client.rpc(
      'find_matching_closet_outfits',
      { p_workspace_id: this.workspaceId, p_item_ids: itemIds },
    )
    if (error) throw error

    return (
      (data ?? []) as Array<{
        id: string
        display_name: string | null
        rating: Outfit['rating']
        archived_at: string | null
      }>
    ).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at,
    }))
  }

  async create(input: OutfitCreateInput): Promise<Outfit> {
    const { data, error } = await this.client.rpc('create_closet_outfit', {
      p_workspace_id: this.workspaceId,
      p_outfit_id: input.id,
      p_display_name: input.displayName?.trim() || null,
      p_items: input.items.map(toOutfitItemWriteRow),
      p_allow_duplicate: input.allowDuplicate,
    })
    if (error) throw error

    const row = (Array.isArray(data) ? data[0] : data) as OutfitRow | null
    if (!row) throw new Error('저장된 Outfit을 불러오지 못했습니다.')
    return {
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at ?? null,
      itemIds: input.items.map((item) => item.itemId),
      itemPlacements: input.items.map((item) => ({
        itemId: item.itemId,
        slot: item.slot,
        positionX: item.positionX,
        positionY: item.positionY,
        itemScale: item.itemScale,
        zIndex: item.zIndex,
      })),
    }
  }

  async clone(input: OutfitCloneInput): Promise<Outfit> {
    const { data, error } = await this.client.rpc('clone_closet_outfit', {
      p_workspace_id: this.workspaceId,
      p_source_outfit_id: input.sourceOutfitId,
      p_outfit_id: input.id,
      p_display_name: input.displayName?.trim() || null,
    })
    if (error) throw error

    const row = (Array.isArray(data) ? data[0] : data) as OutfitRow | null
    if (!row) throw new Error('복제된 Outfit을 불러오지 못했습니다.')
    const relations = await collectAllPages<OutfitItemRow>(
      async (from, to) => {
        const result = await this.client
          .from('closet_outfit_items')
          .select(
            'outfit_id,item_id,sort_order,slot,position_x,position_y,scale,z_index',
          )
          .eq('workspace_id', this.workspaceId)
          .eq('outfit_id', input.id)
          .order('sort_order')
          .order('item_id')
          .range(from, to)
        return {
          data: result.data as OutfitItemRow[] | null,
          error: result.error,
        }
      },
    )
    if (relations.error) throw relations.error

    const links = relations.data ?? []
    return {
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at ?? null,
      itemIds: links.map((link) => link.item_id),
      itemPlacements: links.map((link) => ({
        itemId: link.item_id,
        slot: link.slot,
        positionX: nullableNumericValue(link.position_x),
        positionY: nullableNumericValue(link.position_y),
        itemScale: nullableNumericValue(link.scale),
        zIndex: link.z_index,
      })),
    }
  }

  async update(outfitId: string, input: OutfitUpdateInput): Promise<Outfit> {
    const { data, error } = await this.client.rpc('update_closet_outfit', {
      p_workspace_id: this.workspaceId,
      p_outfit_id: outfitId,
      p_display_name: input.displayName?.trim() || null,
      p_items: input.items.map(toOutfitItemWriteRow),
      p_allow_duplicate: input.allowDuplicate,
    })
    if (error) throw error

    const row = (Array.isArray(data) ? data[0] : data) as OutfitRow | null
    if (!row) throw new Error('수정된 Outfit을 불러오지 못했습니다.')
    return {
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at ?? null,
      itemIds: input.items.map((item) => item.itemId),
      itemPlacements: input.items.map((item) => ({
        itemId: item.itemId,
        slot: item.slot,
        positionX: item.positionX,
        positionY: item.positionY,
        itemScale: item.itemScale,
        zIndex: item.zIndex,
      })),
    }
  }

  async setArchived(outfitId: string, archived: boolean) {
    const { data, error } = await this.client
      .from('closet_outfits')
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', outfitId)
      .eq('workspace_id', this.workspaceId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Outfit을 찾을 수 없습니다.')
  }

  async delete(outfitId: string) {
    const result = await this.client.functions.invoke('closet-outfit-delete', {
      body: { workspaceId: this.workspaceId, outfitId },
    })
    if (result.error) throw result.error
  }

  async updateItemPlacement(input: OutfitItemPlacementInput) {
    const { data, error } = await this.client
      .from('closet_outfit_items')
      .update({
        slot: input.slot,
        position_x: input.positionX,
        position_y: input.positionY,
        scale: input.itemScale,
        z_index: input.zIndex,
      })
      .eq('workspace_id', this.workspaceId)
      .eq('outfit_id', input.outfitId)
      .eq('item_id', input.itemId)
      .select('outfit_id,item_id,slot,position_x,position_y,scale,z_index')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Outfit 구성 아이템을 찾을 수 없습니다.')
  }

}
