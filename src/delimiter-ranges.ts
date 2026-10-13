import type { SuperDocRef } from "@superdoc/react";

type Instance = NonNullable<ReturnType<SuperDocRef["getInstance"]>>;
type Doc = NonNullable<NonNullable<Instance["activeEditor"]>["doc"]>;
export type SelectionTarget = NonNullable<
  Awaited<ReturnType<Doc["selection"]["current"]>>["selectionTarget"]
>;
type Range = { start: number; end: number };
type Block = Range & { id: string; text: string };

export function paragraphText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(paragraphText).join("");
  const record = node as Record<string, unknown>;
  if (record.kind === "run") return (record.run as { text: string }).text;
  if (record.kind === "lineBreak") return "\n";
  if (record.kind === "tab") return "\t";
  if (record.kind === "field")
    return (record.field as { resultText?: string }).resultText ?? "";
  return Object.values(record).map(paragraphText).join("");
}

export function readDelimiterRanges(body: unknown) {
  const blocks: Block[] = [];
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.kind === "paragraph" || node.kind === "heading") {
      const id =
        node.id ??
        (node.paragraphIds as { paraId?: string } | undefined)?.paraId;
      if (typeof id !== "string")
        throw new Error("A paragraph has no address for delimiter formatting.");
      const text = paragraphText(node);
      const start = blocks.length ? blocks[blocks.length - 1]!.end + 1 : 0;
      blocks.push({ id, text, start, end: start + text.length });
      return;
    }
    Object.values(node).forEach(visit);
  }
  visit(body);
  const text = blocks.map((block) => block.text).join("\n");
  const markers: Range[] = [];
  const pairs: Range[] = [];
  const opens: number[] = [];
  for (const match of text.matchAll(/\[\[format\]\]|\[\[\/format\]\]/g)) {
    const start = match.index;
    const end = start + match[0].length;
    markers.push({ start, end });
    if (match[0] === "[[format]]") opens.push(end);
    else {
      const open = opens.pop();
      if (open !== undefined) pairs.push({ start: open, end: start });
    }
  }
  const merged: Range[] = [];
  for (const pair of pairs.sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && pair.start <= previous.end)
      previous.end = Math.max(previous.end, pair.end);
    else merged.push({ ...pair });
  }
  const regions: Range[] = [];
  for (const pair of merged) {
    let start = pair.start;
    for (const marker of markers) {
      if (marker.end <= start || marker.start >= pair.end) continue;
      if (marker.start > start) regions.push({ start, end: marker.start });
      start = marker.end;
    }
    if (start <= pair.end) regions.push({ start, end: pair.end });
  }

  function offset(point: SelectionTarget["start"]) {
    if (point.kind !== "text")
      throw new Error("Delimiter formatting requires a text selection.");
    const block = blocks.find((block) => block.id === point.blockId);
    if (!block)
      throw new Error(
        "The selected paragraph could not be located for delimiter formatting.",
      );
    return block.start + point.offset;
  }

  function selection(
    start: number,
    end: number,
    template: SelectionTarget,
  ): SelectionTarget {
    function point(position: number): SelectionTarget["start"] {
      const block = blocks.find(
        (block) => position >= block.start && position <= block.end,
      );
      if (!block)
        throw new Error(
          "The delimiter formatting range could not be resolved.",
        );
      return {
        kind: "text",
        blockId: block.id,
        offset: position - block.start,
        ...(template.story ? { story: template.story } : {}),
      };
    }
    return { ...template, start: point(start), end: point(end) };
  }

  function intersections(start: number, end: number) {
    return regions
      .map((region) => ({
        start: Math.max(start, region.start),
        end: Math.min(end, region.end),
      }))
      .filter((range) => range.start < range.end);
  }

  function partition(start: number, end: number) {
    const result: Array<Range & { formatted: boolean }> = [];
    let cursor = start;
    for (const range of intersections(start, end)) {
      if (cursor < range.start)
        result.push({ start: cursor, end: range.start, formatted: false });
      result.push({ ...range, formatted: true });
      cursor = range.end;
    }
    if (cursor < end) result.push({ start: cursor, end, formatted: false });
    return result;
  }

  return {
    blocks,
    text,
    markers,
    regions,
    offset,
    selection,
    intersections,
    partition,
  };
}

export function insertDelimiterText(
  map: ReturnType<typeof readDelimiterRanges>,
  blockId: string,
  offset: number,
  text: string,
) {
  return readDelimiterRanges(
    map.blocks.map((block) => ({
      kind: "paragraph",
      id: block.id,
      paragraph: {
        inlines: [
          {
            kind: "run",
            run: {
              text:
                block.id === blockId
                  ? block.text.slice(0, offset) +
                    text +
                    block.text.slice(offset)
                  : block.text,
            },
          },
        ],
      },
    })),
  );
}
