import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

const source = "before [[format]]inside[[/format]] after";

async function setup(page: import("@playwright/test").Page, text = source) {
  await page.goto("/");
  const button = page.getByRole("button", {
    name: "Format between delimiters",
  });
  await expect(button).toBeEnabled({ timeout: 60_000 });
  const title = page
    .locator(".superdoc-text-run")
    .filter({ hasText: /^MUTUAL NON-DISCLOSURE AGREEMENT$/ });
  await title.click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 31; index++)
    await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.insertText(text);
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: text }),
  ).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  return page.locator(".superdoc-text-run").filter({ hasText: text });
}

test("delimiter mode formats inside edits, edits outside normally, and exports plain formatting", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = await setup(page);
  await run.click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 17; index++)
    await page.keyboard.press("ArrowRight");
  for (let index = 0; index < 6; index++)
    await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.insertText("NEWINSIDE");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: /^inside$/ }),
  ).toHaveCSS("text-decoration-line", "line-through");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "NEWINSIDE" }),
  ).toHaveCSS("text-decoration-line", "underline");
  await page
    .locator(".superdoc-text-run")
    .filter({ hasText: "before [[format]]" })
    .click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 6; index++)
    await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.insertText("OUTSIDE");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "OUTSIDE" }),
  ).toHaveCSS("text-decoration-line", "none");
  await expect(page.locator(".superdoc")).not.toContainText("before");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DOCX" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("No exported DOCX.");
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file("word/document.xml")?.async("string");
  expect(xml).not.toMatch(/<w:(ins|del|rPrChange|pPrChange)\b/);
  const runs = xml?.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? [];
  expect(runs.find((run) => run.includes("NEWINSIDE"))).toMatch(/<w:u\b/);
  expect(runs.find((run) => run.includes("inside"))).toMatch(/<w:strike\b/);
  for (const run of runs.filter((run) => /\[\[\/?format\]\]/.test(run)))
    expect(run).not.toMatch(
      /<w:u\b[^>]*w:val="single"|<w:strike\b[^>]*w:val="true"/,
    );
});

test("fast typing preserves every character and keeps newly typed markers plain", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = await setup(page);
  await run.click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 17; index++)
    await page.keyboard.press("ArrowRight");
  const typed = "FASTTYPING".repeat(5);
  await page.keyboard.type(typed);
  await page.keyboard.type("[");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ hasText: "FASTTYPING" }),
  ).toContainText(`${typed}[inside`);
  await page.keyboard.type("[format]]NESTED[[/format]]");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DOCX" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("No exported DOCX.");
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const result = await page.evaluate((xml) => {
    const namespace =
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const heading = [...document.getElementsByTagNameNS(namespace, "p")].find(
      (p) => p.textContent?.includes("FASTTYPING"),
    );
    const spans = [
      ...(heading?.getElementsByTagNameNS(namespace, "r") ?? []),
    ].map((run) => ({
      text: [...run.getElementsByTagNameNS(namespace, "t")]
        .map((t) => t.textContent)
        .join(""),
      underline:
        run
          .getElementsByTagNameNS(namespace, "u")[0]
          ?.getAttributeNS(namespace, "val") === "single",
    }));
    return {
      spans,
      text: spans.map((span) => span.text).join(""),
      underlined: spans
        .filter((span) => span.underline)
        .map((span) => span.text)
        .join(""),
    };
  }, xml);
  expect(result.text).toBe(
    `before [[format]]${typed}[[format]]NESTED[[/format]]inside[[/format]] after`,
  );
  expect(result.underlined).toContain(typed);
  expect(result.underlined).toContain("NESTED");
  expect(result.underlined).not.toContain("[[format]]");
  expect(result.underlined).not.toContain("[[/format]]");
  const markers = [
    ...result.text.matchAll(/\[\[format\]\]|\[\[\/format\]\]/g),
  ].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  let offset = 0;
  for (const span of result.spans) {
    const end = offset + span.text.length;
    if (markers.some((marker) => marker.start < end && marker.end > offset))
      expect(span.underline).toBe(false);
    offset = end;
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("delimiter regions span paragraphs and keep edits outside the closing marker plain", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = await setup(page);
  await run.click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 17; index++)
    await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("ACROSSPARAGRAPHS");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "ACROSSPARAGRAPHS" }),
  ).toHaveCSS("text-decoration-line", "underline");
  await page.keyboard.press("End");
  await page.keyboard.insertText("OUTSIDEAFTER");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "OUTSIDEAFTER" }),
  ).toHaveCSS("text-decoration-line", "none");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an unmatched opening marker uses normal replacement behavior", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = await setup(page, "before [[format]]inside after");
  await run.click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 17; index++)
    await page.keyboard.press("ArrowRight");
  for (let index = 0; index < 6; index++)
    await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.insertText("UNMATCHED");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "UNMATCHED" }),
  ).toHaveCSS("text-decoration-line", "none");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ hasText: "UNMATCHED" }),
  ).toHaveText("before [[format]]UNMATCHED after");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a selection crossing a marker formats only the enclosed text", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = await setup(page);
  await run.click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 23; index++)
    await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.insertText("REPLACEMENT");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: /^inside$/ }),
  ).toHaveCSS("text-decoration-line", "line-through");
  await expect(page.locator(".superdoc")).not.toContainText(
    "before [[format]]",
  );
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "REPLACEMENT" }),
  ).toHaveCSS("text-decoration-line", "none");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
