import { createController } from "./internal/controller";
import { prepareSelectionEdit } from "./internal/selection-formatting";
import { enforceSdtUnderline } from "./internal/sdt-underline";
import type { ControllerOptions } from "./types";

export function createDocumentFormattingController(options: ControllerOptions) {
  return createController(
    options,
    {
      prepare: (doc, target, intent) =>
        prepareSelectionEdit(doc, target, intent, true),
    },
    enforceSdtUnderline,
  );
}
