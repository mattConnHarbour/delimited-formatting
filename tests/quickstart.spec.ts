import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const edit = 'REACTQUICKSTARTEDITMARKER';

test('gates readiness, edits, and exports the sample document', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  let releaseDocument = () => {};
  const documentHeld = new Promise<void>((resolve) => {
    releaseDocument = resolve;
  });
  await page.route('**/sample.docx', async (route) => {
    await documentHeld;
    await route.continue();
  });

  await page.goto('/');
  const exportButton = page.getByRole('button', { name: 'Export DOCX' });
  await expect(exportButton).toBeDisabled();
  releaseDocument();
  await expect(exportButton).toBeEnabled({ timeout: 120_000 });

  await page.getByRole('button', { name: 'Add SDT' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Block SDT added.');
  await expect(page.locator('.superdoc')).toContainText('Enter text in this block content control.');
  await expect(page.locator('.superdoc-text-run').filter({ hasText: 'Enter text in this block content control.' })).toBeInViewport();

  const textRun = page.locator('.superdoc-text-run').first();
  await expect(textRun).toBeVisible({ timeout: 60_000 });
  await textRun.click();
  await page.keyboard.type(edit);
  await expect(page.locator('.superdoc')).toContainText(edit);
  await page.getByRole('button', { name: 'Add SDT' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add SDT' })).toBeEnabled();
  await expect(page.locator('.superdoc-text-run').filter({ hasText: 'Enter text in this block content control.' })).toHaveCount(2);

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await exportButton.click();
  const path = await (await download).path();
  if (!path) throw new Error('The browser did not save the exported DOCX.');

  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  expect(documentXml).toBeTruthy();
  expect(documentXml?.replace(/<[^>]+>/g, '')).toContain(edit);
  const blockSdts = await page.evaluate((xml) => {
    const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    return [...document.getElementsByTagNameNS(namespace, 'sdt')].flatMap((control) => {
      const properties = [...control.children].find(child => child.localName === 'sdtPr');
      const tag = properties?.getElementsByTagNameNS(namespace, 'tag')[0]?.getAttributeNS(namespace, 'val');
      if (!tag?.startsWith('demo.block-sdt.')) return [];
      const content = [...control.children].find(child => child.localName === 'sdtContent');
      const paragraphs = [...(content?.children ?? [])].filter(child => child.localName === 'p');
      return [{ paragraphCount: paragraphs.length, text: paragraphs.map(p => p.textContent).join('\n') }];
    });
  }, documentXml ?? '');
  expect(blockSdts).toHaveLength(2);
  for (const blockSdt of blockSdts ?? []) {
    expect(blockSdt.paragraphCount).toBeGreaterThan(0);
    expect(blockSdt.text).toContain('Enter text in this block content control.');
  }
  expect(errors).toEqual([]);
});
