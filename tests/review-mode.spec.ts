import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

test('review mode formats additions and deletions without highlights or DOCX revision records', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const review = page.getByRole('button', { name: 'Format all' });
  await expect(review).toBeEnabled({ timeout: 60_000 });
  await expect(review).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Add SDT' }).click();
  await expect(page.getByRole('button', { name: 'Add SDT' })).toBeEnabled();
  await review.click();
  await expect(review).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.superdoc-text-run').filter({ hasText: /^MUTUAL NON-DISCLOSURE AGREEMENT$/ }).click();
  await page.keyboard.press('Home');
  for (let index = 0; index < 6; index++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('REVIEWADDITION');
  const bodyDeletion = page.locator('.superdoc-text-run').filter({ hasText: /^MUTUAL$/ });
  const heading = page.getByRole('heading', { level: 1 }).filter({ hasText: 'MUTUAL' });
  await expect(heading).toContainText('REVIEWADDITION');
  const bodyAdditions = page.locator('.superdoc-text-run').filter({ hasText: /^[REVIEWADDITION]+$/ });
  await expect(bodyDeletion).toHaveCSS('text-decoration-line', 'line-through');
  expect(await bodyAdditions.count()).toBeGreaterThan(0);
  for (const run of await bodyAdditions.all()) await expect(run).toHaveCSS('text-decoration-line', 'underline');

  await page.locator('.superdoc-text-run').filter({ hasText: 'Enter text in this block content control.' }).click();
  await page.keyboard.press('Home');
  for (let index = 0; index < 5; index++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('SDTREVIEW');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: /^Enter$/ })).toHaveCSS('text-decoration-line', /line-through/);
  await expect(page.locator('.superdoc')).toContainText('SDTREVIEW');
  const sdtAdditions = page.locator('.superdoc-text-run').filter({ hasText: /^[SDTREVIEW]+$/ });
  expect(await sdtAdditions.count()).toBeGreaterThan(0);
  for (const run of await sdtAdditions.all()) await expect(run).toHaveCSS('text-decoration-line', 'underline');
  await expect(page.locator('.track-delete-dec, .track-insert-dec, .track-format-dec')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('No exported DOCX.');
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml')?.async('string');
  expect(xml).not.toMatch(/<w:(ins|del|rPrChange|pPrChange)\b/);
  const runs = xml?.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? [];
  expect(runs.filter((run) => run.includes('MUTUAL')).join('')).toMatch(/<w:strike\b/);
  expect(runs.filter((run) => run.includes('Enter')).join('')).toMatch(/<w:strike\b/);
  const underlinedText = runs.filter((run) => /<w:u\b/.test(run) && !/<w:strike\b[^>]*w:val="true"/.test(run)).map((run) => run.replace(/<[^>]+>/g, '')).join('');
  expect(underlinedText).toContain('REVIEWADDITION');
  expect(underlinedText).toContain('SDTREVIEW');

  await page.getByRole('button', { name: 'Format none' }).click();
  await expect(review).toHaveAttribute('aria-pressed', 'false');
  await expect(bodyDeletion).toBeVisible();
});

test('review mode preserves text on Backspace and Delete and underlines pasted text', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const review = page.getByRole('button', { name: 'Format all' });
  await expect(review).toBeEnabled({ timeout: 60_000 });
  await review.click();
  await page.locator('.superdoc-text-run').filter({ hasText: /^MUTUAL NON-DISCLOSURE AGREEMENT$/ }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: 'MUTUAL' })).toHaveText('MUTUAL NON-DISCLOSURE AGREEMENT');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: /^M$/ })).toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: /^U$/ })).toHaveCSS('text-decoration-line', 'line-through');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: /^T$/ })).toHaveCSS('text-decoration-line', 'line-through');
  await page.evaluate(() => navigator.clipboard.writeText('PASTEREVIEW'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: 'PASTEREVIEW' })).toHaveCSS('text-decoration-line', 'underline');
  await expect(page.locator('.track-delete-dec, .track-insert-dec, .track-format-dec')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
