import type { SuperDocRef } from "@superdoc/react";
import {
  paragraphText,
  readDelimiterRanges,
  insertDelimiterText,
} from "./delimiter-ranges";

type Instance = NonNullable<ReturnType<SuperDocRef["getInstance"]>>;
type Doc = NonNullable<NonNullable<Instance["activeEditor"]>["doc"]>;
type Target = NonNullable<
  Awaited<ReturnType<Doc["selection"]["current"]>>["selectionTarget"]
>;
type Intent =
  | { type: "insert"; text: string; html?: string }
  | { type: "break"; soft?: boolean }
  | { type: "delete"; backward: boolean; word?: boolean };
export type FormattingScope = "sdts" | "all" | "delimiters" | "none";

function isRange(target: Target): boolean {
  return (
    target.start.kind !== "text" ||
    target.end.kind !== "text" ||
    target.start.blockId !== target.end.blockId ||
    target.start.offset !== target.end.offset
  );
}

export function installFormattingReview(
  element: HTMLElement,
  getInstance: () => Instance | null,
  onError: (error: unknown) => void,
  scope: Exclude<FormattingScope, "none"> = "all",
  onSuccess?: () => void,
) {
  let queue = Promise.resolve();
  let caret: Target | null = null;
  let selectionGeneration = 0;
  let pendingText: { intent: Intent | Promise<Intent> } | null = null;

  async function edit(intent: Intent) {
    if (
      intent.type === "insert" &&
      !intent.html &&
      /[\r\n]/.test(intent.text)
    ) {
      const lines = intent.text.replace(/\r\n?/g, "\n").split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (index > 0) await edit({ type: "break" });
        if (lines[index]) await edit({ type: "insert", text: lines[index]! });
      }
      return;
    }
    const instance = getInstance();
    const doc = instance?.activeEditor?.doc;
    if (!instance || !doc) throw new Error("The document is not ready.");
    const generation = selectionGeneration;
    let target = caret ?? (await doc.selection.current()).selectionTarget;
    if (!target) throw new Error("Place the caret in the document first.");
    let editCaret: Target;
    let delimiterMap: ReturnType<typeof readDelimiterRanges> | undefined;
    let formatEdit = scope === "all";
    if (scope === "sdts") {
      const selection = target;
      const controls = await doc.contentControls.list({ limit: 1000 });
      formatEdit = controls.items.some((control) => {
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
      });
    }
    if (intent.type === "delete" && !isRange(target)) {
      if (target.start.kind !== "text") return;
      const point = target.start;
      const story = point.story ?? target.story;
      const result = story
        ? await doc.getNode({
            kind: "block",
            nodeType: "paragraph",
            nodeId: point.blockId,
            story,
          })
        : await doc.getNodeById({ nodeId: point.blockId });
      const text = paragraphText(result.node);
      const offsets = [
        ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
          text,
        ),
      ].map((part) => part.index);
      offsets.push(text.length);
      let boundary = intent.backward
        ? (offsets.filter((offset) => offset < point.offset).at(-1) ??
          point.offset)
        : (offsets.find((offset) => offset > point.offset) ?? point.offset);
      if (intent.word) {
        const adjacent = intent.backward
          ? text.slice(0, point.offset)
          : text.slice(point.offset);
        const word = intent.backward
          ? adjacent.match(/\s*\S+\s*$/)?.[0]
          : adjacent.match(/^\s*\S+\s*/)?.[0];
        if (word)
          boundary =
            point.offset + (intent.backward ? -word.length : word.length);
      }
      target = {
        ...target,
        start: { ...point, offset: Math.min(point.offset, boundary) },
        end: { ...point, offset: Math.max(point.offset, boundary) },
      };
    }
    if (scope === "delimiters") {
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
      delimiterMap = updated;
      editCaret = updated.selection(position, position, target);
    } else {
      if (isRange(target)) {
        const changed = formatEdit
          ? await doc.format.strike({ target, value: true })
          : await doc.delete({ target });
        if (!changed.success && changed.failure.code !== "NO_OP")
          throw new Error(changed.failure.message);
      }
      const anchor =
        !formatEdit || (intent.type === "delete" && intent.backward)
          ? target.start
          : target.end;
      editCaret = { ...target, start: anchor, end: anchor };
    }
    const anchor = editCaret.start;
    if (intent.type === "break") {
      if (anchor.kind !== "text")
        throw new Error("Place the caret in a paragraph first.");
      if (intent.soft) {
        const inserted = await doc.insert({
          target: editCaret,
          type: "html",
          value: "<br>",
        });
        if (!inserted.success)
          throw new Error(
            inserted.failure?.message ??
              "The line break could not be inserted.",
          );
        const endpoint = inserted.effects?.insertedText?.at(-1)?.selectionTarget
          .end ?? { ...anchor, offset: anchor.offset + 1 };
        editCaret = { ...editCaret, start: endpoint, end: endpoint };
      } else {
        const story = anchor.story ?? target.story;
        const block = story
          ? await doc.getNode({
              kind: "block",
              nodeType: "paragraph",
              nodeId: anchor.blockId,
              story,
            })
          : await doc.getNodeById({ nodeId: anchor.blockId });
        if (block.address.kind !== "block")
          throw new Error("The paragraph could not be resolved.");
        const split = await doc.blocks.split({
          target: block.address,
          offset: anchor.offset,
          coordinateSpace: target.coordinateSpace,
        });
        if (!split.success) throw new Error(split.failure.message);
        const endpoint = {
          kind: "text" as const,
          blockId: split.inserted.nodeId,
          offset: 0,
          ...(split.inserted.story ? { story: split.inserted.story } : {}),
        };
        editCaret = { ...editCaret, start: endpoint, end: endpoint };
      }
      if (editCaret.end.kind === "text") {
        const point = editCaret.end;
        await instance.ui.viewport.scrollIntoView({
          target: {
            kind: "text",
            blockId: point.blockId,
            range: { start: point.offset, end: point.offset },
            story: point.story ?? editCaret.story,
          },
          behavior: "instant",
          block: "nearest",
        });
      }
    }
    if (intent.type === "insert" && intent.text) {
      const inserted = await doc.insert({
        target: editCaret,
        value: intent.html ?? intent.text,
        type: intent.html ? "html" : "text",
      });
      if (!inserted.success)
        throw new Error(
          inserted.failure?.message ?? "The text could not be inserted.",
        );
      const spans = inserted.effects?.insertedText ?? [];
      if (spans.length === 0)
        throw new Error("The editor did not return the inserted text range.");
      if (scope === "delimiters") {
        const story =
          editCaret.story ??
          (editCaret.start.kind === "text" ? editCaret.start.story : undefined);
        const span = spans.length === 1 ? spans[0] : undefined;
        const simpleInsert =
          !intent.html &&
          delimiterMap &&
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
                delimiterMap!,
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
            [...html.querySelectorAll<HTMLElement>("[style]")].some((element) =>
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
      } else if (formatEdit) {
        for (const span of spans) {
          const formatted = await doc.format.apply({
            target: span.selectionTarget,
            inline: { underline: true, strike: false },
          });
          if (!formatted.success && formatted.failure.code !== "NO_OP")
            throw new Error(formatted.failure.message);
        }
      }
      const last = spans[spans.length - 1]!;
      editCaret = {
        ...last.selectionTarget,
        start: last.selectionTarget.end,
        end: last.selectionTarget.end,
      };
    }
    if (generation !== selectionGeneration) {
      onSuccess?.();
      return;
    }
    caret = editCaret;
    let applied = instance.ui.selection.apply(editCaret);
    if (!applied.ok && intent.type === "break") {
      const deadline = performance.now() + 2_000;
      while (!applied.ok && performance.now() < deadline) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        applied = instance.ui.selection.apply(editCaret);
      }
    }
    if (!applied.ok)
      throw new Error(
        `The editor could not restore the caret after the review edit: ${applied.reason}.`,
      );
    onSuccess?.();
  }

  function enqueue(intent: Intent | Promise<Intent>) {
    const canCombine =
      scope === "delimiters" &&
      !(intent instanceof Promise) &&
      intent.type === "insert" &&
      !intent.html &&
      !/[\r\n]/.test(intent.text);
    if (
      canCombine &&
      pendingText &&
      !(pendingText.intent instanceof Promise) &&
      pendingText.intent.type === "insert"
    ) {
      pendingText.intent.text += intent.text;
      return;
    }
    const job = { intent };
    pendingText = canCombine ? job : null;
    queue = queue
      .catch(() => {})
      .then(async () => {
        if (pendingText === job) pendingText = null;
        await edit(await job.intent);
      });
    void queue.catch((error: unknown) => {
      caret = null;
      onError(error);
    });
  }

  function inEditor(event: Event) {
    return (
      event.target instanceof Element &&
      Boolean(event.target.closest(".superdoc-layout, [data-v2-ime-host]"))
    );
  }

  function consume(event: Event, intent: Intent) {
    event.preventDefault();
    event.stopImmediatePropagation();
    enqueue(intent);
  }

  function keydown(event: KeyboardEvent) {
    if (!inEditor(event) || event.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      event.stopImmediatePropagation();
      const plain = event.shiftKey;
      enqueue(
        (async (): Promise<Intent> => {
          const items = await navigator.clipboard.read();
          let text = "";
          let html: string | undefined;
          for (const item of items) {
            if (item.types.includes("text/plain"))
              text += await (await item.getType("text/plain")).text();
            if (!plain && item.types.includes("text/html"))
              html =
                (html ?? "") + (await (await item.getType("text/html")).text());
          }
          return { type: "insert", text: text || (html ? " " : ""), html };
        })(),
      );
    } else if (event.key === "Backspace" || event.key === "Delete") {
      consume(event, {
        type: "delete",
        backward: event.key === "Backspace",
        word: event.altKey || event.ctrlKey || event.metaKey,
      });
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (event.key.length === 1 || event.key === "Enter")
    ) {
      consume(
        event,
        event.key === "Enter"
          ? { type: "break", soft: event.shiftKey }
          : { type: "insert", text: event.key },
      );
    } else {
      resetCaret();
    }
  }

  function beforeinput(event: InputEvent) {
    if (!inEditor(event) || event.isComposing) return;
    if (event.inputType.startsWith("delete")) {
      consume(event, {
        type: "delete",
        backward: !event.inputType.includes("Forward"),
        word: event.inputType.includes("Word"),
      });
    } else if (event.inputType === "insertText" && event.data) {
      consume(event, { type: "insert", text: event.data });
    } else if (
      event.inputType === "insertParagraph" ||
      event.inputType === "insertLineBreak"
    ) {
      consume(event, {
        type: "break",
        soft: event.inputType === "insertLineBreak",
      });
    }
  }

  function paste(event: ClipboardEvent) {
    if (!inEditor(event)) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const html = event.clipboardData?.getData("text/html") || undefined;
    if (text || html)
      consume(event, { type: "insert", text: text || " ", html });
  }

  function cut(event: ClipboardEvent) {
    if (!inEditor(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const instance = getInstance();
    const target = instance?.ui.selection.getSnapshot().selectionTarget;
    if (!instance || !target || !isRange(target)) return;
    event.clipboardData?.setData(
      "text/plain",
      instance.ui.selection.getSnapshot().quotedText,
    );
    enqueue({ type: "delete", backward: false });
  }

  const resetCaret = () => {
    selectionGeneration++;
    caret = null;
    pendingText = null;
  };
  const pointerdown = (event: PointerEvent) => {
    if (inEditor(event)) resetCaret();
  };
  element.addEventListener("keydown", keydown, true);
  element.addEventListener("beforeinput", beforeinput, true);
  element.addEventListener("paste", paste, true);
  element.addEventListener("cut", cut, true);
  element.addEventListener("pointerdown", pointerdown, true);
  return {
    flush: () => queue,
    resetSelection: resetCaret,
    destroy() {
      element.removeEventListener("keydown", keydown, true);
      element.removeEventListener("beforeinput", beforeinput, true);
      element.removeEventListener("paste", paste, true);
      element.removeEventListener("cut", cut, true);
      element.removeEventListener("pointerdown", pointerdown, true);
    },
  };
}
