import { createController } from "./internal/controller";
import { prepareSelectionEdit } from "./internal/selection-formatting";
import { enforceSdtUnderline } from "./internal/sdt-underline";
import type { ControllerOptions, DocumentApi, SelectionTarget } from "./types";

async function insideSdt(
  doc: DocumentApi,
  selection: SelectionTarget,
): Promise<boolean> {
  let offset = 0;
  while (true) {
    const controls = await doc.contentControls.list({ offset, limit: 100 });
    if (
      controls.items.some((control) => {
        const range = control.selectionTarget;
        return (
          range?.start.kind === "text" &&
          range.end.kind === "text" &&
          selection.start.kind === "text" &&
          selection.end.kind === "text" &&
          selection.start.blockId === range.start.blockId &&
          selection.end.blockId === range.end.blockId &&
          selection.start.offset >= range.start.offset &&
          selection.end.offset <= range.end.offset
        );
      })
    )
      return true;
    offset += controls.items.length;
    if (offset >= controls.total || controls.items.length === 0) return false;
  }
}

export function createSDTFormattingController(options: ControllerOptions) {
  return createController(
    options,
    {
      async prepare(doc, target, intent) {
        return prepareSelectionEdit(
          doc,
          target,
          intent,
          await insideSdt(doc, target),
        );
      },
    },
    enforceSdtUnderline,
  );
}
