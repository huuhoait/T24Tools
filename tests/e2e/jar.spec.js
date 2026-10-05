import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const FIXTURE = fileURLToPath(new URL('./fixtures/classes-RTEST.json', import.meta.url));
const upload = (page, name, buffer) =>
  page
    .locator('input[type=file][aria-label="classes.json file"]')
    .setInputFiles({ name, mimeType: 'application/json', buffer });

test.describe('JAR Viewer', () => {
  test('finds a class, shows its JAR, follows the superclass', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?tool=jar');
    await upload(page, 'classes-RTEST.json', readFileSync(FIXTURE));
    await expect(page.getByText(/RTEST · 2 classes · 2 JARs/)).toBeVisible();
    await page.getByLabel('Search classes, packages or JARs').fill('samplelife');
    await page.getByRole('button', { name: /SampleLifecycle/ }).click();
    const detail = page.getByRole('region', { name: 'Class detail' });
    await expect(detail).toContainText('SAMPLE_Hooks.jar');
    await expect(detail).toContainText('checkId(java.lang.String)');
    await detail.getByRole('button', { name: 'com.sample.core.BaseContext' }).click();
    await expect(detail).toContainText('SAMPLE_Core.jar');
    expect(errors).toEqual([]);
  });

  test('a JAR name lists its classes', async ({ page }) => {
    await page.goto('./?tool=jar');
    await upload(page, 'classes-RTEST.json', readFileSync(FIXTURE));
    await page.getByLabel('Show types').getByLabel('internal').check();
    await page.getByLabel('Search classes, packages or JARs').fill('sample_core.jar');
    await expect(page.getByRole('heading', { name: 'SAMPLE_Core.jar' })).toBeVisible();
    await expect(page.getByText('BaseContext')).toBeVisible();
  });

  test('a fields.json is refused with a pointer to the Application Viewer', async ({ page }) => {
    await page.goto('./?tool=jar');
    await upload(page, 'fields.json', Buffer.from('{"release":"R23","apps":{}}'));
    await expect(page.getByRole('alert')).toContainText('Application Viewer');
  });

  test('loads the published R23 index and finds RecordLifecycle', async ({ page }) => {
    await page.goto('./?tool=jar');
    await page.getByRole('button', { name: 'Load R23 from this site' }).click();
    await expect(page.getByText(/R23 · [\d,]+ classes/)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Search classes, packages or JARs').fill('RecordLifecycle');
    await page
      .getByRole('button', { name: /^RecordLifecycle com\.temenos\.t24\.api\.hook\.system/ })
      .click();
    await expect(page.getByRole('region', { name: 'Class detail' })).toContainText(
      'EB_TemplateHook.jar',
    );
  });

  test('in R25 the RecordLifecycle superclass links to T24Context in the TAFJ runtime', async ({
    page,
  }) => {
    await page.goto('./?tool=jar');
    await page.getByRole('button', { name: 'Load R25 from this site' }).click();
    await expect(page.getByText(/R25 · [\d,]+ classes/)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Search classes, packages or JARs').fill('RecordLifecycle');
    await page
      .getByRole('button', { name: /^RecordLifecycle com\.temenos\.t24\.api\.hook\.system/ })
      .click();
    const detail = page.getByRole('region', { name: 'Class detail' });
    await detail
      .getByRole('button', { name: 'com.temenos.tafj.api.client.impl.T24Context' })
      .click();
    await expect(detail.getByRole('heading', { name: 'T24Context' })).toBeVisible();
    await expect(detail).toContainText('TAFJClient.jar');
    await expect(detail).toContainText('tafj');
  });
});
