import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlaceHvacProfileInput } from '../../lib/types'
import {
  toPlaceHvacProfile,
  type PlaceHvacProfileRow,
} from './shared'

const PLACE_HVAC_PROFILE_SELECTION =
  'workspace_id,place_id,season,expected_hvac_mode,expected_hvac_intensity,memo,source,last_confirmed_on,created_at'

export class SupabasePlaceHvacProfileRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async save(input: PlaceHvacProfileInput) {
    const mutableFields = {
      expected_hvac_mode: input.expectedMode,
      expected_hvac_intensity: input.expectedIntensity,
      memo: input.memo?.trim() || null,
      source: input.source,
      last_confirmed_on: input.lastConfirmedOn,
    }
    const updated = await this.client
      .from('closet_place_hvac_profiles')
      .update(mutableFields)
      .eq('workspace_id', this.workspaceId)
      .eq('place_id', input.placeId)
      .eq('season', input.season)
      .select(PLACE_HVAC_PROFILE_SELECTION)
      .maybeSingle()

    if (updated.error) throw updated.error
    if (updated.data) {
      return toPlaceHvacProfile(updated.data as PlaceHvacProfileRow)
    }

    const { data, error } = await this.client
      .from('closet_place_hvac_profiles')
      .insert({
        workspace_id: this.workspaceId,
        place_id: input.placeId,
        season: input.season,
        ...mutableFields,
      })
      .select(PLACE_HVAC_PROFILE_SELECTION)
      .single()

    if (error) throw error
    return toPlaceHvacProfile(data as PlaceHvacProfileRow)
  }
}
