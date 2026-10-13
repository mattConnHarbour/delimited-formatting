import { expect, test } from '@playwright/test';

test('SDT scope formats only SDTs, and none restores normal editing inside SDTs', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const sdts = page.getByRole('button', { name: 'Format SDTs' });
  const all = page.getByRole('button', { name: 'Format all' });
  const none = page.getByRole('button', { name: 'Format none' });
  await expect(sdts).toBeEnabled({ timeout: 60_000 });
  await expect(none).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add SDT' }).click();
  await expect(page.getByRole('button', { name: 'Add SDT' })).toBeEnabled();
  await sdts.click();
  await expect(sdts).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(none).toHaveAttribute('aria-pressed', 'false');

  await page.locator('.superdoc-text-run').filter({ hasText: /^MUTUAL NON-DISCLOSURE AGREEMENT$/ }).click();
  await page.keyboard.press('Home');
  for (let index = 0; index < 6; index++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.insertText('OUTSIDE');
  await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: 'OUTSIDE' })).toHaveText('OUTSIDE NON-DISCLOSURE AGREEMENT');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: 'OUTSIDE' })).toHaveCSS('text-decoration-line', 'none');

  await page.locator('.superdoc-text-run').filter({ hasText: 'Enter text in this block content control.' }).click();
  await page.keyboard.press('Home');
  for (let index = 0; index < 5; index++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.insertText('INSIDE');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: /^Enter$/ })).toHaveCSS('text-decoration-line', /line-through/);
  await expect(page.locator('.superdoc-text-run').filter({ hasText: 'INSIDE' })).toHaveCSS('text-decoration-line', 'underline');

  await none.click();
  await expect(none).toHaveAttribute('aria-pressed', 'true');
  await expect(sdts).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.superdoc-text-run').filter({ hasText: ' text in this block content control.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+u');
  await page.keyboard.insertText('NORMAL');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: 'NORMAL' })).toHaveCSS('text-decoration-line', 'none');
  for (let index = 0; index < 6; index++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.superdoc')).not.toContainText('NORMAL');
  await expect(page.locator('.track-delete-dec, .track-insert-dec, .track-format-dec')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
