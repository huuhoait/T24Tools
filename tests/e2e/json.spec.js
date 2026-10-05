import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Synthetic knowledge file: sample app and fields only, no Temenos data.
const KNOWLEDGE = fileURLToPath(new URL('./fixtures/knowledge-RTEST.json', import.meta.url));

test.describe('Application Viewer', () => {
  test('pasted JSON is formatted, folded and searchable', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?tool=json');
    await page
      .getByLabel('JSON source')
      .fill('{"name":"T24","tags":["a","b"],"deep":{"x":{"y":42}}}');
    const tree = page.getByLabel('JSON tree');
    await expect(tree).toContainText('"tags": ["a", "b"],');
    await expect(tree).toContainText('"y": 42');

    await page.getByRole('button', { name: 'Collapse root' }).click();
    await expect(tree).not.toContainText('"y"');
    await page.getByLabel('Search keys and values').fill('42');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: /deep\.x\.y/ }).click();
    await expect(tree).toContainText('"y": 42');
    await expect(page.locator('.json-statusbar code')).toHaveText('deep.x.y');
    expect(errors).toEqual([]);
  });

  test('invalid JSON reports where it broke', async ({ page }) => {
    await page.goto('./?tool=json');
    await page.getByLabel('JSON source').fill('{\n  "a": 1,\n  oops\n}');
    await expect(page.getByRole('alert')).toContainText(/line 3/);
  });

  test('Upload file keeps several files and switches between them', async ({ page }) => {
    await page.goto('./?tool=json');
    await page.getByRole('tab', { name: 'Upload file' }).click();
    await expect(page.getByText('Drop .json files here')).toBeVisible();
    await page.locator('input[type=file][aria-label="JSON file"]').setInputFiles([
      {
        name: 'knowledge-RTEST.json',
        mimeType: 'application/json',
        buffer: readFileSync(KNOWLEDGE),
      },
      {
        name: 'small.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"hello":"world"}'),
      },
    ]);
    const list = page.getByRole('list', { name: 'Uploaded files' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: 'Upload file (2)' })).toBeVisible();
    await expect(page.getByText(/T24 knowledge RTEST/)).toBeVisible();

    await list.getByRole('button', { name: /^small\.json/ }).click();
    await expect(page.getByLabel('JSON tree')).toContainText('"hello": "world"');
    await page.getByRole('button', { name: 'Remove small.json' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByText('Nothing loaded yet.')).toBeVisible();
  });

  test('a knowledge file gets the T24 applications index', async ({ page }) => {
    await page.goto('./?tool=json');
    await page.locator('input[type=file][aria-label="JSON file"]').setInputFiles(KNOWLEDGE);
    await expect(page.getByText(/T24 knowledge RTEST · 1 apps · 2 fields/)).toBeVisible();
    await page.getByRole('tab', { name: 'T24 applications' }).click();
    await page.getByLabel('Search applications and fields').fill('SC.NAME');
    await page.getByRole('list', { name: 'Fields' }).getByRole('button').first().click();
    await expect(page.getByRole('heading', { name: 'SAMPLE.CUSTOMER' })).toBeVisible();
    await expect(page.locator('.json-table tr.on')).toContainText('SC.NAME');

    await page.getByRole('button', { name: 'Show in tree' }).click();
    await expect(page.getByLabel('JSON tree')).toContainText('"SC.NAME"');
  });

  test('Load R23 / R25 from this site opens the published fields.json', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?tool=json');
    const tabs = page.getByRole('tablist', { name: 'Input method' });
    await expect(tabs.getByRole('tab')).toHaveText(['Paste JSON', 'Upload file']);
    for (const release of ['R23', 'R25']) {
      await page.getByRole('button', { name: `Load ${release} from this site` }).click();
      await expect(
        page.getByText(new RegExp(`T24 knowledge ${release} · [\\d,]+ apps`)),
      ).toBeVisible({
        timeout: 30_000,
      });
    }
    await page.getByRole('tab', { name: 'T24 applications' }).click();
    await page.getByLabel('Search applications and fields').fill('ACCOUNT');
    await expect(page.getByRole('list', { name: 'Fields' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
