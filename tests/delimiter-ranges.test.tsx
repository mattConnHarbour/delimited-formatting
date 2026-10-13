import { expect, test } from "vitest";
import {
  readDelimiterRanges,
  insertDelimiterText,
} from "../src/delimiter-ranges";

function body(...texts: string[]) {
  return texts.map((text, index) => ({
    kind: "paragraph",
    id: `p${index}`,
    paragraph: { inlines: [{ kind: "run", run: { text } }] },
  }));
}

test("matches complete pairs and excludes their markers", () => {
  const map = readDelimiterRanges(
    body("outside [[format]]inside[[/format]] outside"),
  );
  expect(
    map.regions.map((range) => map.text.slice(range.start, range.end)),
  ).toEqual(["inside"]);
  expect(
    map
      .partition(0, map.text.length)
      .map((part) => [map.text.slice(part.start, part.end), part.formatted]),
  ).toEqual([
    ["outside [[format]]", false],
    ["inside", true],
    ["[[/format]] outside", false],
  ]);
  expect(readDelimiterRanges(body("[[format]]unclosed")).regions).toEqual([]);
  expect(readDelimiterRanges(body("unopened[[/format]]")).regions).toEqual([]);
});

test("updates a plain insertion exactly like a fresh document read", () => {
  const original = body("before [[format]]😀inside[[/format]]", "after");
  const map = readDelimiterRanges(original);
  const updated = insertDelimiterText(map, "p0", 17, "FAST");
  const fresh = readDelimiterRanges(
    body("before [[format]]FAST😀inside[[/format]]", "after"),
  );
  expect(updated.blocks).toEqual(fresh.blocks);
  expect(updated.regions).toEqual(fresh.regions);
  expect(updated.markers).toEqual(fresh.markers);
  expect(map.text).toBe("before [[format]]😀inside[[/format]]\nafter");
});

test("supports multiple pairs, nested markers, and empty regions", () => {
  const map = readDelimiterRanges(
    body(
      "[[format]]a[[format]]b[[/format]]c[[/format]] [[format]][[/format]] [[format]]d[[/format]]",
    ),
  );
  expect(
    map.regions.map((range) => map.text.slice(range.start, range.end)),
  ).toEqual(["a", "b", "c", "", "d"]);
});

test("maps UTF-16 offsets across paragraphs", () => {
  const map = readDelimiterRanges(
    body("[[format]]😀first", "second[[/format]]"),
  );
  const template = {
    kind: "selection" as const,
    start: { kind: "text" as const, blockId: "p0", offset: 10 },
    end: { kind: "text" as const, blockId: "p1", offset: 6 },
  };
  expect(map.offset(template.start)).toBe(10);
  expect(
    map.regions.map((range) => map.text.slice(range.start, range.end)),
  ).toEqual(["😀first\nsecond"]);
  expect(
    map.selection(
      map.offset(template.start),
      map.offset(template.end),
      template,
    ),
  ).toEqual(template);
});
