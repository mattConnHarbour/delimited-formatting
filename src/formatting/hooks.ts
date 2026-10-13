import { createSDTFormattingController } from "./sdt-controller";
import { createDocumentFormattingController } from "./document-controller";
import { createDelimitedFormattingController } from "./delimited-controller";
import { useFormattingController } from "./internal/use-formatting-controller";
import type { FormattingHookOptions } from "./types";

export function useSDTFormatting(options: FormattingHookOptions) {
  return useFormattingController(createSDTFormattingController, options);
}

export function useDocumentFormatting(options: FormattingHookOptions) {
  return useFormattingController(createDocumentFormattingController, options);
}

export function useDelimitedFormatting(options: FormattingHookOptions) {
  return useFormattingController(createDelimitedFormattingController, options);
}
