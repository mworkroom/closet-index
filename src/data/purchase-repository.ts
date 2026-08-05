import type {
  CurrentQuantityUpdateInput,
  PurchaseEvent,
  PurchaseEventCreateInput,
  PurchaseEventDeleteInput,
  PurchaseEventUpdateInput,
} from '../lib/types'

export interface PurchaseRepository {
  load(itemId: string): Promise<PurchaseEvent[]>
  loadForItems(itemIds: readonly string[]): Promise<PurchaseEvent[]>
  create(input: PurchaseEventCreateInput): Promise<PurchaseEvent>
  update(input: PurchaseEventUpdateInput): Promise<PurchaseEvent>
  delete(input: PurchaseEventDeleteInput): Promise<void>
  setCurrentQuantity(input: CurrentQuantityUpdateInput): Promise<number | null>
}
