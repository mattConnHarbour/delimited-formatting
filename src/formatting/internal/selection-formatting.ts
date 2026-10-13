import type {
  DocumentApi,
  EditIntent,
  SelectionTarget,
  InsertedSpan,
} from "../types";

export function isRange(target: SelectionTarget): boolean {
  return (
    target.start.kind !== "text" ||
    target.end.kind !== "text" ||
    target.start.blockId !== target.end.blockId ||
    target.start.offset !== target.end.offset
  );
}

export async function prepareSelectionEdit(
  doc: DocumentApi,
  target: SelectionTarget,
  intent: EditIntent,
  formatted: boolean,
) {
  if (isRange(target)) {
    const changed = formatted
      ? await doc.format.strike({ target, value: true })
      : await doc.delete({ target });
    if (!changed.success && changed.failure.code !== "NO_OP")
      throw new Error(changed.failure.message);
  }
  const anchor =
    !formatted || (intent.type === "delete" && intent.backward)
      ? target.start
      : target.end;
  return {
    caret: { ...target, start: anchor, end: anchor },
    async formatInserted(spans: InsertedSpan[]) {
      if (!formatted) return;
      for (const span of spans) {
        const receipt = await doc.format.apply({
          target: span.selectionTarget,
          inline: { underline: true, strike: false },
        });
        if (!receipt.success && receipt.failure.code !== "NO_OP")
          throw new Error(receipt.failure.message);
      }
    },
  };
}
