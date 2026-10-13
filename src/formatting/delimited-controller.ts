import {
  insertDelimiterText,
  readDelimiterRanges,
} from "./internal/delimiter-ranges";
import { createController } from "./internal/controller";
import type { ControllerOptions } from "./types";

export function createDelimitedFormattingController(
  options: ControllerOptions,
) {
  return createController(options, {
    combinePlainText: true,
    async prepare(doc, target, intent) {
      const story =
        target.story ??
        (target.start.kind === "text" ? target.start.story : undefined);
      const map = readDelimiterRanges((await doc.get({ in: story })).body);
      const start = map.offset(target.start);
      const end = map.offset(target.end);
      const parts = map.partition(start, end);
      for (const part of parts.filter((part) => part.formatted)) {
        const receipt = await doc.format.strike({
          target: map.selection(part.start, part.end, target),
          value: true,
        });
        if (!receipt.success && receipt.failure.code !== "NO_OP")
          throw new Error(receipt.failure.message);
      }
      for (const part of parts.filter((part) => !part.formatted).reverse()) {
        const receipt = await doc.delete({
          target: map.selection(part.start, part.end, target),
        });
        if (!receipt.success && receipt.failure.code !== "NO_OP")
          throw new Error(receipt.failure.message);
      }
      const retained = parts
        .filter((part) => part.formatted)
        .reduce((length, part) => length + part.end - part.start, 0);
      const position =
        start + (intent.type === "delete" && intent.backward ? 0 : retained);
      const updated = parts.some((part) => !part.formatted)
        ? readDelimiterRanges((await doc.get({ in: story })).body)
        : map;
      const delimiterMap = updated;
      const editCaret = updated.selection(position, position, target);
      return {
        caret: editCaret,
        async formatInserted(spans, intent) {
          const story =
            editCaret.story ??
            (editCaret.start.kind === "text"
              ? editCaret.start.story
              : undefined);
          const span = spans.length === 1 ? spans[0] : undefined;
          const simpleInsert =
            !intent.html &&
            editCaret.start.kind === "text" &&
            span?.selectionTarget.start.kind === "text" &&
            span.selectionTarget.end.kind === "text" &&
            span.selectionTarget.start.blockId === editCaret.start.blockId &&
            span.selectionTarget.end.blockId === editCaret.start.blockId &&
            span.selectionTarget.start.offset === editCaret.start.offset &&
            span.text === intent.text;
          const map =
            simpleInsert && editCaret.start.kind === "text"
              ? insertDelimiterText(
                  delimiterMap,
                  editCaret.start.blockId,
                  editCaret.start.offset,
                  intent.text,
                )
              : readDelimiterRanges((await doc.get({ in: story })).body);
          const insertedRanges: Array<{ start: number; end: number }> = [];
          for (const span of spans) {
            const start = map.offset(span.selectionTarget.start);
            const end = map.offset(span.selectionTarget.end);
            insertedRanges.push({ start, end });
            for (const range of map.partition(start, end)) {
              const formatted = await doc.format.apply({
                target: map.selection(
                  range.start,
                  range.end,
                  span.selectionTarget,
                ),
                inline: { underline: range.formatted, strike: false },
              });
              if (!formatted.success && formatted.failure.code !== "NO_OP")
                throw new Error(formatted.failure.message);
            }
          }
          for (const marker of map.markers.filter((marker) =>
            insertedRanges.some(
              (range) => marker.start < range.end && marker.end > range.start,
            ),
          )) {
            const markerTarget = map.selection(
              marker.start,
              marker.end,
              editCaret,
            );
            const html = new DOMParser().parseFromString(
              await doc.getHtml({ scope: markerTarget }),
              "text/html",
            );
            const decorated =
              html.querySelector("u, s, strike") ||
              [...html.querySelectorAll<HTMLElement>("[style]")].some(
                (element) =>
                  /underline|line-through/.test(
                    `${element.style.textDecoration} ${element.style.textDecorationLine}`,
                  ),
              );
            if (decorated) {
              const clear = await doc.format.apply({
                target: markerTarget,
                inline: { underline: false, strike: false },
              });
              if (!clear.success && clear.failure.code !== "NO_OP")
                throw new Error(clear.failure.message);
            }
          }
        },
      };
    },
  });
}
