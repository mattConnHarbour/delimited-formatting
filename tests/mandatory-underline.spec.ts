import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

test('enforces SDT underline for typing, formatting removal, and paste without formatting outside text', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add SDT' });
  await expect(add).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Format SDTs' }).click();
  await add.click();
  await expect(add).toBeEnabled();
  await expect(page.getByRole('status')).toHaveText('Block SDT added.');
  const starter = page.locator('.superdoc-text-run').filter({ hasText: 'Enter text in this block content control.' });
  await expect(starter).toBeInViewport();

  await starter.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+u');
  await page.keyboard.insertText('MANDATORYTYPING');
  const typed = page.locator('.superdoc-text-run').filter({ hasText: 'MANDATORYTYPING' });
  await expect(typed).toHaveCSS('text-decoration-line', 'underline');

  await page.keyboard.press('ControlOrMeta+Shift+ArrowLeft');
  await page.keyboard.press('ControlOrMeta+u');
  await expect(typed).toHaveCSS('text-decoration-line', 'underline');
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => navigator.clipboard.writeText('MANDATORYPASTE'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: 'MANDATORYPASTE' })).toHaveCSS('text-decoration-line', 'underline');
  await expect(page.getByRole('alert')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('No exported DOCX.');
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml')?.async('string');
  const controls = xml?.match(/<w:sdt\b[^>]*>[\s\S]*?<\/w:sdt>/g) ?? [];
  expect(controls).toHaveLength(1);
  const control = controls[0];
  if (!control) throw new Error('No exported SDT.');
  expect(control).toContain('MANDATORYTYPING');
  expect(control).toContain('MANDATORYPASTE');
  for (const run of control.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? []) {
    if (/<w:t\b/.test(run)) expect(run).toMatch(/<w:u\b[^>]*w:val="single"/);
  }
  const outside = xml?.replace(control, '') ?? '';
  expect(outside).toContain('MUTUAL NON-DISCLOSURE AGREEMENT');
  expect(outside).not.toMatch(/<w:u\b/);
});
