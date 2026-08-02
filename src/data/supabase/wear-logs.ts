import type { SupabaseClient } from '@supabase/supabase-js'
import type { WearLogInput } from '../../lib/types'
import {
  toWearLog,
  toWearLogMutableRow,
  type WearLogRow,
} from './shared'

const WEAR_LOG_SELECTION =
  'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at'

export class SupabaseWearLogRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async create(input: WearLogInput) {
    const { data, error } = await this.client
      .from('closet_wear_logs')
      .insert({
        ...toWearLogMutableRow(input),
        id: crypto.randomUUID(),
        workspace_id: this.workspaceId,
        submission_token: input.submissionToken,
      })
      .select(WEAR_LOG_SELECTION)
      .single()

    if (error?.code === '23505') {
      const existing = await this.client
        .from('closet_wear_logs')
        .select(WEAR_LOG_SELECTION)
        .eq('workspace_id', this.workspaceId)
        .eq('submission_token', input.submissionToken)
        .maybeSingle()
      if (!existing.error && existing.data) {
        return toWearLog(existing.data as WearLogRow)
      }
    }
    if (error) throw error
    return toWearLog(data as WearLogRow)
  }

  async update(id: string, input: WearLogInput) {
    const { data, error } = await this.client
      .from('closet_wear_logs')
      .update({
        ...toWearLogMutableRow(input),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)
      .select(WEAR_LOG_SELECTION)
      .single()

    if (error) throw error
    return toWearLog(data as WearLogRow)
  }

  async delete(id: string) {
    const { error } = await this.client
      .from('closet_wear_logs')
      .delete()
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)

    if (error) throw error
  }
}
