import type {
  AppData,
  OutfitItemPositionInput,
  WearLog,
  WearLogInput,
} from '../lib/types'

export interface ClosetRepository {
  load(): Promise<AppData>
  updateItemSuitability(
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ): Promise<void>
  updateOutfitItemPosition(input: OutfitItemPositionInput): Promise<void>
  createWearLog(input: WearLogInput): Promise<WearLog>
  updateWearLog(id: string, input: WearLogInput): Promise<WearLog>
  deleteWearLog(id: string): Promise<void>
}
