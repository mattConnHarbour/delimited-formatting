import type { FormattingDelimiters } from "../types";

export const DEFAULT_DELIMITERS: FormattingDelimiters = Object.freeze({
  open: "[[format]]",
  close: "[[/format]]",
});

export function resolveDelimiters(
  delimiters: FormattingDelimiters = DEFAULT_DELIMITERS,
): FormattingDelimiters {
  const { open, close } = delimiters;
  if (
    typeof open !== "string" ||
    typeof close !== "string" ||
    !open.length ||
    !close.length
  )
    throw new Error(
      "Opening and closing delimiters must be non-empty strings.",
    );
  if (open === close)
    throw new Error("Opening and closing delimiters must be different.");
  return { open, close };
}

export function delimiterPattern(delimiters: FormattingDelimiters): RegExp {
  const escaped = [delimiters.open, delimiters.close]
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("|"), "g");
}
