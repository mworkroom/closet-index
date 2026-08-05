import type {
  CareEvent,
  CareEventCreateInput,
  CareEventDeleteInput,
  CareEventUpdateInput,
} from '../lib/types'

export interface CareRepository {
  load(itemId: string): Promise<CareEvent[]>
  loadForItems(itemIds: readonly string[]): Promise<CareEvent[]>
  create(input: CareEventCreateInput): Promise<CareEvent>
  update(input: CareEventUpdateInput): Promise<CareEvent>
  delete(input: CareEventDeleteInput): Promise<void>
}
