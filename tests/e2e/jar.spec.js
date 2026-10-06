import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const FIXTURE = fileURLToPath(new URL('./fixtures/classes-RTEST.json', import.meta.url));
const upload = (page, name, buffer) =>
  page
    .locator('input[type=file][aria-label="classes.json file"]')
    .setInputFiles({ name, mimeType: 'application/json', buffer });
const jarsTab = (page) => page.getByRole('tab', { name: 'JARs' }).click();
const loadSite = async (page, release) => {
  await page.getByRole('button', { name: `Load ${release} from this site` }).click();
  await expect(page.getByText(new RegExp(`${release} · [\\d,]+ classes`))).toBeVisible({
    timeout: 30_000,
  });
};

test.describe('JAR Viewer', () => {
  test('opens as a JSON tree, and the JARs tab lists JARs, their classes and a class', async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?tool=jar');
    await upload(page, 'classes-RTEST.json', readFileSync(FIXTURE));
    await expect(page.getByText(/RTEST · 2 classes · 2 JARs/)).toBeVisible();
    await expect(page.getByLabel('JSON tree')).toContainText('"SAMPLE_Hooks.jar"');

    await jarsTab(page);
    const jars = page.getByRole('list', { name: 'JARs' });
    await expect(jars.getByRole('button')).toHaveCount(2);
    await jars.getByRole('button', { name: /SAMPLE_Hooks\.jar/ }).click();
    const inJar = page.getByLabel('Classes in JAR');
    await expect(page.getByRole('heading', { name: 'SAMPLE_Hooks.jar' })).toBeVisible();
    await inJar.getByRole('button', { name: /SampleLifecycle/ }).click();
    const detail = page.getByRole('region', { name: 'Class detail' });
    await expect(detail).toContainText('SAMPLE_Hooks.jar');
    await expect(detail).toContainText('checkId(java.lang.String)');

    // The superclass lives in another JAR: following it opens that JAR on the right.
    await detail.getByRole('button', { name: 'com.sample.core.BaseContext' }).click();
    await expect(page.getByRole('heading', { name: 'SAMPLE_Core.jar' })).toBeVisible();
    await expect(detail).toContainText('abstract');
    expect(errors).toEqual([]);
  });

  test('searching filters the JARs and finds classes', async ({ page }) => {
    await page.goto('./?tool=jar');
    await upload(page, 'classes-RTEST.json', readFileSync(FIXTURE));
    await jarsTab(page);
    await page.getByLabel('Search JARs and classes').fill('core');
    const jars = page.getByRole('list', { name: 'JARs' });
    await expect(jars.getByRole('button')).toHaveCount(1);
    await expect(jars).toContainText('SAMPLE_Core.jar');

    await page.getByLabel('Search JARs and classes').fill('samplelife');
    await page
      .getByRole('list', { name: 'Classes found' })
      .getByRole('button', { name: /SampleLifecycle/ })
      .click();
    await expect(page.getByRole('heading', { name: 'SAMPLE_Hooks.jar' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Class detail' })).toContainText(
      'com.sample.hook',
    );
  });

  test('a hidden type is left out of a JAR until it is ticked', async ({ page }) => {
    await page.goto('./?tool=jar');
    await upload(page, 'classes-RTEST.json', readFileSync(FIXTURE));
    await jarsTab(page);
    await page
      .getByRole('list', { name: 'JARs' })
      .getByRole('button', { name: /SAMPLE_Core/ })
      .click();
    await expect(page.getByLabel('Classes in JAR')).toContainText('No classes of the shown types');
    await page.getByLabel('Show types').getByLabel('internal').check();
    await expect(page.getByLabel('Classes in JAR')).toContainText('BaseContext');
  });

  test('a fields.json is refused with a pointer to the Application Viewer', async ({ page }) => {
    await page.goto('./?tool=jar');
    await upload(page, 'fields.json', Buffer.from('{"release":"R23","apps":{}}'));
    await expect(page.getByRole('alert')).toContainText('Application Viewer');
  });

  test('loads the published R23 index and lists EB_TemplateHook.jar', async ({ page }) => {
    await page.goto('./?tool=jar');
    await loadSite(page, 'R23');
    await jarsTab(page);
    await page.getByLabel('Search JARs and classes').fill('EB_TemplateHook');
    await page
      .getByRole('list', { name: 'JARs' })
      .getByRole('button', { name: /^EB_TemplateHook\.jar/ })
      .click();
    await page
      .getByLabel('Classes in JAR')
      .getByRole('button', { name: /^RecordLifecycle\b/ })
      .click();
    await expect(page.getByRole('region', { name: 'Class detail' })).toContainText(
      'com.temenos.t24.api.hook.system',
    );
  });

  test('in R25 the RecordLifecycle superclass links to T24Context in the TAFJ runtime', async ({
    page,
  }) => {
    await page.goto('./?tool=jar');
    await loadSite(page, 'R25');
    await jarsTab(page);
    await page.getByLabel('Search JARs and classes').fill('RecordLifecycle');
    await page
      .getByRole('list', { name: 'Classes found' })
      .getByRole('button', { name: /^RecordLifecycle · EB_TemplateHook\.jar/ })
      .click();
    const detail = page.getByRole('region', { name: 'Class detail' });
    await detail
      .getByRole('button', { name: 'com.temenos.tafj.api.client.impl.T24Context' })
      .click();
    await expect(detail.getByRole('heading', { name: 'T24Context' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'TAFJClient.jar' })).toBeVisible();
    await expect(detail).toContainText('tafj');
  });

  test('a type that only the second release has is shown, with release badges', async ({
    page,
  }) => {
    await page.goto('./?tool=jar');
    for (const release of ['R23', 'R25']) await loadSite(page, release);
    await jarsTab(page);
    await expect(page.getByLabel('Show types').getByLabel('tafj')).toBeChecked();
    await page.getByLabel('Search JARs and classes').fill('T24Context');
    const hit = page
      .getByRole('list', { name: 'Classes found' })
      .getByRole('button', { name: /^T24Context · TAFJClient\.jar/ });
    await expect(hit).toContainText('R25 only');
    await hit.click();
    await expect(page.getByRole('region', { name: 'Class detail' })).toContainText('R25 only');
  });
});
