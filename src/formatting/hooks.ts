import { useCallback } from "react";
import { createSDTFormattingController } from "./sdt-controller";
import { createDocumentFormattingController } from "./document-controller";
import { createDelimitedFormattingController } from "./delimited-controller";
import { useFormattingController } from "./internal/use-formatting-controller";
import { DEFAULT_DELIMITERS } from "./internal/delimiters";
import type {
  FormattingHookOptions,
  DelimitedFormattingHookOptions,
  ControllerOptions,
} from "./types";

export function useSDTFormatting(options: FormattingHookOptions) {
  return useFormattingController(createSDTFormattingController, options);
}

export function useDocumentFormatting(options: FormattingHookOptions) {
  return useFormattingController(createDocumentFormattingController, options);
}

export function useDelimitedFormatting(
  options: DelimitedFormattingHookOptions,
) {
  const { open, close } = options.delimiters ?? DEFAULT_DELIMITERS;
  const create = useCallback(
    (controllerOptions: ControllerOptions) =>
      createDelimitedFormattingController({
        ...controllerOptions,
        delimiters: { open, close },
      }),
    [open, close],
  );
  return useFormattingController(create, options);
}
