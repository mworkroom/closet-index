import type {
  ReplacementLineItemAddInput,
  ReplacementLineItemRemoveInput,
  ReplacementLineRecord,
  ReplacementLineSnapshot,
} from '../../lib/types'

export function replaceReplacementLine(
  snapshot: ReplacementLineSnapshot,
  savedLine: ReplacementLineRecord,
): ReplacementLineSnapshot {
  return {
    ...snapshot,
    lines: snapshot.lines.map((line) =>
      line.id === savedLine.id ? savedLine : line,
    ),
  }
}

export function applyAddedReplacementLineItem(
  snapshot: ReplacementLineSnapshot,
  input: ReplacementLineItemAddInput,
  savedLine: ReplacementLineRecord,
): ReplacementLineSnapshot {
  return {
    lines: snapshot.lines.map((line) =>
      line.id === savedLine.id ? savedLine : line,
    ),
    memberships: [
      ...snapshot.memberships.filter(
        (membership) => membership.itemId !== input.itemId,
      ),
      {
        replacementLineId: savedLine.id,
        itemId: input.itemId,
      },
    ],
  }
}

export function applyRemovedReplacementLineItem(
  snapshot: ReplacementLineSnapshot,
  input: ReplacementLineItemRemoveInput,
  savedLines: ReplacementLineRecord[],
): ReplacementLineSnapshot {
  const savedById = new Map(savedLines.map((line) => [line.id, line]))
  return {
    lines: snapshot.lines.map((line) => savedById.get(line.id) ?? line),
    memberships: snapshot.memberships.filter(
      (membership) =>
        membership.replacementLineId !== input.sourceLineId ||
        membership.itemId !== input.itemId,
    ),
  }
}
