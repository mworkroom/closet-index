import type { AppData, Suitability, WearLog, WearLogInput } from '../lib/types'

export interface ClosetRepository {
  load(): Promise<AppData>
  updateItemSuitability(
    itemId: string,
    rainOk: Suitability,
    longWalkOk: Suitability,
  ): Promise<void>
  createWearLog(input: WearLogInput): Promise<WearLog>
  updateWearLog(id: string, input: WearLogInput): Promise<WearLog>
  deleteWearLog(id: string): Promise<void>
}
