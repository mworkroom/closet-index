import type {
  ReplacementLineArchiveInput,
  ReplacementLineColorUpdateInput,
  ReplacementLineCreateInput,
  ReplacementLineDeleteInput,
  ReplacementLineDetailsUpdateInput,
  ReplacementLineEdge,
  ReplacementLineEdgeConnectionUpdateInput,
  ReplacementLineEdgeDirectionUpdateInput,
  ReplacementLineEdgeDisconnectInput,
  ReplacementLineItemAddInput,
  ReplacementLineItemMoveInput,
  ReplacementLineItemRemoveInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineMergeInput,
  ReplacementLineRecord,
  ReplacementLineReviewInput,
  ReplacementLineSnapshot,
  ReplacementLineStart,
} from '../lib/types'

export interface ReplacementLineRepository {
  load(): Promise<ReplacementLineSnapshot>
  loadEdges(): Promise<ReplacementLineEdge[]>
  updateEdgeConnection(
    edgeId: string,
    input: ReplacementLineEdgeConnectionUpdateInput,
  ): Promise<ReplacementLineEdge>
  disconnectEdge(
    edgeId: string,
    input: ReplacementLineEdgeDisconnectInput,
  ): Promise<boolean>
  reverseEdge(
    edgeId: string,
    input: ReplacementLineEdgeDirectionUpdateInput,
  ): Promise<ReplacementLineEdge>
  loadStarts(): Promise<ReplacementLineStart[]>
  setStart(
    replacementLineId: string,
    itemId: string,
    isStart: boolean,
  ): Promise<boolean>
  createManualEdge(
    input: ReplacementLineManualEdgeInput,
  ): Promise<ReplacementLineEdge>
  create(input: ReplacementLineCreateInput): Promise<ReplacementLineRecord>
  moveItem(input: ReplacementLineItemMoveInput): Promise<ReplacementLineRecord>
  addItem(input: ReplacementLineItemAddInput): Promise<ReplacementLineRecord>
  removeItem(
    input: ReplacementLineItemRemoveInput,
  ): Promise<ReplacementLineRecord[]>
  mergeLines(input: ReplacementLineMergeInput): Promise<ReplacementLineRecord>
  setArchived(input: ReplacementLineArchiveInput): Promise<ReplacementLineRecord>
  setColorCategory(
    input: ReplacementLineColorUpdateInput,
  ): Promise<ReplacementLineRecord>
  acknowledgeReview(
    input: ReplacementLineReviewInput,
  ): Promise<ReplacementLineRecord>
  updateDetails(
    input: ReplacementLineDetailsUpdateInput,
  ): Promise<ReplacementLineRecord>
  deleteEmpty(input: ReplacementLineDeleteInput): Promise<boolean>
}
