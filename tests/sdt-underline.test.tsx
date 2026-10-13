import { expect, test } from "vitest";
import { hasTextWithoutUnderline } from "../src/formatting/internal/sdt-underline";

test("recognizes semantic and styled underline without requesting another formatting write", () => {
  expect(
    hasTextWithoutUnderline("<p><u>Text <strong>and bold</strong></u></p>"),
  ).toBe(false);
  expect(
    hasTextWithoutUnderline(
      '<p><span style="text-decoration: underline">Text</span></p>',
    ),
  ).toBe(false);
  expect(
    hasTextWithoutUnderline(
      '<p><span style="text-decoration-line: underline">Text</span></p>',
    ),
  ).toBe(false);
  expect(hasTextWithoutUnderline("<p> \n </p>")).toBe(false);
});

test("detects plain text and mixed formatting including links", () => {
  expect(hasTextWithoutUnderline("<p>Plain text</p>")).toBe(true);
  expect(
    hasTextWithoutUnderline(
      '<p><u>Underlined</u> plain <a href="#">link</a></p>',
    ),
  ).toBe(true);
  expect(
    hasTextWithoutUnderline(
      '<p><span style="text-decoration: none">Not underlined</span></p>',
    ),
  ).toBe(true);
});
