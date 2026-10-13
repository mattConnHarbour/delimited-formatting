import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

test("Format all creates a new paragraph inside a block SDT", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const all = page.getByRole("button", { name: "Format all" });
  await expect(all).toBeEnabled({ timeout: 60_000 });
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Add SDT" }).click();
  await expect(page.getByRole("button", { name: "Add SDT" })).toBeEnabled();
  await page
    .locator(".superdoc-text-run")
    .filter({ hasText: "Enter text in this block content control." })
    .click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 5; index++)
    await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("SDTPARAGRAPH");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "SDTPARAGRAPH" }),
  ).toHaveCSS("text-decoration-line", "underline");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DOCX" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("No exported DOCX.");
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file("word/document.xml")?.async("string");
  const control = xml?.match(/<w:sdt\b[^>]*>[\s\S]*?<\/w:sdt>/)?.[0] ?? "";
  const paragraphs =
    control
      .match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)
      ?.map((p) => p.replace(/<[^>]+>/g, "")) ?? [];
  expect(paragraphs).toEqual([
    "Enter",
    "SDTPARAGRAPH text in this block content control.",
  ]);
});

test("Format all splits paragraphs on Enter and keeps subsequent typing underlined", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const all = page.getByRole("button", { name: "Format all" });
  await expect(all).toBeEnabled({ timeout: 60_000 });
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".superdoc-text-run")
    .filter({ hasText: /^MUTUAL NON-DISCLOSURE AGREEMENT$/ })
    .click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 6; index++)
    await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("NEWPARAGRAPH");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "NEWPARAGRAPH" }),
  ).toHaveCSS("text-decoration-line", "underline");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DOCX" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("No exported DOCX.");
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file("word/document.xml")?.async("string");
  const paragraphs =
    xml
      ?.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)
      ?.map((p) => p.replace(/<[^>]+>/g, "")) ?? [];
  expect(paragraphs).toContain("MUTUAL");
  expect(
    paragraphs.some((p) => p === "NEWPARAGRAPH NON-DISCLOSURE AGREEMENT"),
  ).toBe(true);
  expect(xml).not.toMatch(/<w:(ins|del|rPrChange|pPrChange)\b/);
});

test("Format all supports repeated Enter, Shift+Enter, and multiline paste", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const all = page.getByRole("button", { name: "Format all" });
  await expect(all).toBeEnabled({ timeout: 60_000 });
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".superdoc-text-run")
    .filter({ hasText: /^MUTUAL NON-DISCLOSURE AGREEMENT$/ })
    .click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("AFTERENTER");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "AFTERENTER" }),
  ).toHaveCSS("text-decoration-line", "underline");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.insertText("AFTERSOFTBREAK");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "AFTERSOFTBREAK" }),
  ).toHaveCSS("text-decoration-line", "underline");
  await page.evaluate(() =>
    navigator.clipboard.writeText("PASTEFIRST\nPASTESECOND"),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await expect(
    page.locator(".superdoc-text-run").filter({ hasText: "PASTESECOND" }),
  ).toHaveCSS("text-decoration-line", "underline");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DOCX" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("No exported DOCX.");
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file("word/document.xml")?.async("string");
  expect(xml).toMatch(/<w:br\b/);
  const paragraphs =
    xml
      ?.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)
      ?.map((p) => p.replace(/<[^>]+>/g, "")) ?? [];
  expect(paragraphs).toContain("PASTESECOND");
  expect(
    paragraphs.some(
      (p) =>
        p.includes("AFTERENTER") &&
        p.includes("AFTERSOFTBREAK") &&
        p.includes("PASTEFIRST"),
    ),
  ).toBe(true);
});
