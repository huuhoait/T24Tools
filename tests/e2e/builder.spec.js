import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Synthetic knowledge file: sample app and fields only, no Temenos data.
const KNOWLEDGE = fileURLToPath(new URL('./fixtures/knowledge-RTEST.json', import.meta.url));

const output = (page) => page.locator('textarea.routine-output:visible');

test.describe('Knowledge files', () => {
  test('the header links download the published R23 and R25 files', async ({ page }) => {
    await page.goto('./');
    for (const release of ['R23', 'R25']) {
      const link = page.locator('header').getByRole('link', { name: `${release} ⬇` });
      await expect(link).toHaveAttribute('download', `fields-${release}.json`);
      const response = await page.request.get(await link.getAttribute('href'));
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body).toMatchObject({ release, schemaVersion: 3 });
    }
  });

  test('a file loaded in the Artefact Generator is ready in the Routine Builder', async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?tool=artefact');
    await page.locator('input[type=file][aria-label="Knowledge file"]').setInputFiles(KNOWLEDGE);
    await expect(page.getByText('RTEST: 1 applications · 2 fields')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Tools' })
      .getByRole('button', { name: 'Routine Builder' })
      .click();
    const builder = page.locator('section.routine-creator:visible');
    await expect(builder.getByRole('radio', { name: 'RTEST' })).toBeChecked();
    await expect(builder.getByText('RTEST: 1 applications · 2 fields')).toBeVisible();

    // The default ACCOUNT table is not in RTEST.
    await builder.getByRole('button', { name: 'Validate' }).click();
    await expect(builder.getByText('ACCOUNT is not an application in RTEST.')).toBeVisible();

    await builder.getByLabel('Application table 1').fill('SAMPLE.CUSTOMER');
    const fields = builder.getByRole('group', { name: 'SAMPLE.CUSTOMER fields' });
    await expect(fields.getByText('MV')).toBeVisible();
    await fields.getByRole('checkbox', { name: /SC\.NAME/ }).check();
    await expect(output(page)).toHaveValue(/FN\.SAMPLE\.CUSTOMER = "F\.SAMPLE\.CUSTOMER"/);
    await expect(output(page)).toHaveValue(/\$INSERT I_F\.SAMPLE\.CUSTOMER/);
    await expect(output(page)).toHaveValue(/Y\.SC\.NAME = R\.SAMPLE\.CUSTOMER<1>/);
    await expect(builder.getByText('✓ Configuration valid')).toBeVisible();

    // Changing the application clears the fields ticked for the old one.
    await builder.getByLabel('Application table 1').fill('SAMPLE.CUSTOMERX');
    await expect(output(page)).not.toHaveValue(/Y\.SC\.NAME/);
    expect(errors).toEqual([]);
  });

  test('Load R23 from this site, then pick a catalog application', async ({ page }) => {
    await page.goto('./?tool=builder');
    await page.getByRole('button', { name: 'Load R23 from this site' }).click();
    await expect(page.getByText('R23: 4,596 applications · 162,842 fields')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel('Application table 1').fill('ACCOUNT');
    await page
      .getByRole('group', { name: 'ACCOUNT fields' })
      .locator('input[value="AC.CUSTOMER"]')
      .check();
    await expect(output(page)).toHaveValue(/Y\.AC\.CUSTOMER = R\.ACC<1>/);
  });

  test('without a knowledge file the Routine Builder works like the Routine Creator', async ({
    page,
  }) => {
    await page.goto('./?tool=builder');
    await expect(page.getByText('No knowledge file loaded yet.')).toBeVisible();
    await expect(page.getByLabel('Application table 1')).toHaveValue('ACCOUNT');
    await page.getByRole('button', { name: '+ Field' }).click();
    await page.getByLabel('Field name 1').fill('AC.CUSTOMER');
    await page.getByLabel('Field position 1').fill('1');
    await expect(output(page)).toHaveValue(/Y\.AC\.CUSTOMER = R\.ACC<1>/);
  });
});
