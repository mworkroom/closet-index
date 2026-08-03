import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
} from '../../lib/types'
import { CLOSET_IMAGE_BUCKET } from '../image-assets'
import { itemMatchesInput, type ItemRow, toItem } from './shared'

const ITEM_SELECTION =
  'id,name,category,semantic_color,palette_id,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,display_hex,color_palette:closet_color_palette(display_name,display_hex)'

export class SupabaseItemRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async create(input: ItemCreateInput) {
    const row = {
      id: input.id,
      workspace_id: this.workspaceId,
      name: input.name.trim(),
      category: input.category.trim(),
      semantic_color: input.semanticColor?.trim() || null,
      palette_id: input.paletteId,
      display_hex: input.displayHex.toUpperCase(),
      seasons: input.seasons,
      rain_ok: input.rainOk,
      long_walk_ok: input.longWalkOk,
      memo: input.memo?.trim() || null,
      acquired_on: input.acquiredOn,
    }
    const { data, error } = await this.client
      .from('closet_items')
      .insert(row)
      .select(ITEM_SELECTION)
      .single()

    if (error?.code === '23505') {
      const existing = await this.client
        .from('closet_items')
        .select(ITEM_SELECTION)
        .eq('id', input.id)
        .eq('workspace_id', this.workspaceId)
        .maybeSingle()
      if (!existing.error && existing.data) {
        const existingRow = existing.data as unknown as ItemRow
        if (itemMatchesInput(existingRow, input)) return toItem(existingRow)
      }
    }
    if (error) throw error
    return toItem(data as unknown as ItemRow)
  }

  async update(itemId: string, input: ItemWriteInput) {
    const { data, error } = await this.client
      .from('closet_items')
      .update({
        name: input.name.trim(),
        category: input.category.trim(),
        semantic_color: input.semanticColor?.trim() || null,
        palette_id: input.paletteId,
        display_hex: input.displayHex.toUpperCase(),
        seasons: input.seasons,
        rain_ok: input.rainOk,
        long_walk_ok: input.longWalkOk,
        memo: input.memo?.trim() || null,
        acquired_on: input.acquiredOn,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('workspace_id', this.workspaceId)
      .select(ITEM_SELECTION)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Item을 찾을 수 없습니다.')
    return toItem(data as unknown as ItemRow)
  }

  async replaceImage(itemId: string, input: ItemImageUploadInput) {
    const begin = await this.client.functions.invoke('closet-item-image', {
      body: {
        action: 'begin',
        workspaceId: this.workspaceId,
        itemId,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        bytes: input.bytes,
      },
    })
    if (begin.error) throw begin.error
    const ticket = begin.data as {
      imageId: string
      storagePath: string
      token: string
      contentType: string
    }

    try {
      const upload = await this.client.storage
        .from(CLOSET_IMAGE_BUCKET)
        .uploadToSignedUrl(ticket.storagePath, ticket.token, input.blob, {
          contentType: 'image/webp',
          cacheControl: '31536000',
        })
      if (upload.error) throw upload.error

      const finalize = await this.client.functions.invoke('closet-item-image', {
        body: {
          action: 'finalize',
          workspaceId: this.workspaceId,
          itemId,
          imageId: ticket.imageId,
        },
      })
      if (finalize.error) throw finalize.error
    } catch (cause) {
      try {
        await this.client.functions.invoke('closet-item-image', {
          body: {
            action: 'cancel',
            workspaceId: this.workspaceId,
            itemId,
            imageId: ticket.imageId,
          },
        })
      } catch {
        // A later orphan sweep can clean an interrupted pending upload.
      }
      throw cause
    }
  }

  async setRetired(itemId: string, retired: boolean) {
    const { data, error } = await this.client
      .from('closet_items')
      .update({ retired, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('workspace_id', this.workspaceId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Item을 찾을 수 없습니다.')
  }

  async delete(itemId: string) {
    const result = await this.client.functions.invoke('closet-item-image', {
      body: { action: 'delete', workspaceId: this.workspaceId, itemId },
    })
    if (result.error) throw result.error
  }

  async updateSuitability(
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) {
    const { error } = await this.client
      .from('closet_items')
      .update({
        rain_ok: rainOk,
        long_walk_ok: longWalkOk,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('workspace_id', this.workspaceId)

    if (error) throw error
  }
}
