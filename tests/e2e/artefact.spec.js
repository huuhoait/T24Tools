import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Synthetic knowledge file: sample app and fields only, no Temenos data.
const KNOWLEDGE = fileURLToPath(new URL('./fixtures/knowledge-RTEST.json', import.meta.url));

async function loadKnowledge(page) {
  await page.locator('input[type=file][aria-label="Knowledge file"]').setInputFiles(KNOWLEDGE);
  await expect(page.getByText('RTEST: 1 applications · 2 fields')).toBeVisible();
}

test.describe('Artefact Generator', () => {
  test('release -> jBC -> validation generates the routine and its component', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?tool=artefact');
    await expect(page.getByText('No knowledge file loaded yet.')).toBeVisible();
    await loadKnowledge(page);

    await page.getByRole('radio', { name: /jBC/ }).check();
    await page.getByRole('radio', { name: /Validation routine/ }).check();
    await page.getByLabel('Package').fill('SAMPLE.Validation');
    await page.getByLabel('Routine name').fill('V.SAMPLE.CHECK');
    await page.getByLabel('Component method').fill('vSampleCheck');
    await page.getByLabel('Description').fill('Reject an empty name');
    await page.getByLabel('Author').fill('tester');
    await page.getByLabel('Application').fill('SAMPLE.CUSTOMER');
    await page.getByLabel('Field', { exact: true }).selectOption('SC.NAME');
    await page.getByLabel('Error message').fill('NAME IS MANDATORY');
    await page.getByRole('button', { name: 'Generate' }).click();

    await expect(page.getByRole('tab')).toHaveText([
      'SAMPLE.Validation.component',
      'V.SAMPLE.CHECK.b',
    ]);
    const output = page.getByLabel('Generated V.SAMPLE.CHECK.b');
    await expect(output).toContainText('EB.SystemTables.getRNew(SM.Sample.SampleCustomer.ScName)');
    await expect(output).toContainText('$USING SM.Sample');
    await expect(output).not.toContainText('{{');
    await expect(page.locator('main').getByRole('status')).toContainText('verified against RTEST');
    await page.getByRole('tab', { name: 'SAMPLE.Validation.component' }).click();
    await expect(page.getByLabel('Generated SAMPLE.Validation.component')).toContainText(
      'public method vSampleCheck() { jBC: V.SAMPLE.CHECK }',
    );
    expect(errors).toEqual([]);
  });

  test('Java disables multi-value fields and generates a getter for single-value ones', async ({
    page,
  }) => {
    await page.goto('./?tool=artefact');
    await loadKnowledge(page);
    await page.getByRole('radio', { name: /Java/ }).check();
    await page.getByRole('radio', { name: 'RecordLifecycle.validateRecord' }).check();
    await page.getByLabel('Application').fill('SAMPLE.CUSTOMER');
    const field = page.getByLabel('Field', { exact: true });
    await expect(field.locator('option[value="SC.LINES"]')).toHaveAttribute('disabled', '');
    await expect(field.locator('option[value="SC.LINES"]')).toContainText('multi-value (MV)');
    await field.selectOption('SC.NAME');
    await page.getByLabel('Java package').fill('com.sample.hook');
    await page.getByLabel('Class name').fill('SampleGuard');
    await page.getByLabel('Error message').fill('NAME IS MANDATORY');
    await page.getByRole('button', { name: 'Generate' }).click();
    const output = page.getByLabel('Generated SampleGuard.java');
    await expect(output).toContainText(
      'import com.temenos.t24.api.records.samplecustomer.SampleCustomerRecord;',
    );
    await expect(output).toContainText('rec.getName().getValue()');
  });

  test('changing the application clears the field chosen for the previous one', async ({
    page,
  }) => {
    await page.goto('./?tool=artefact');
    await loadKnowledge(page);
    await page.getByRole('radio', { name: /Infobasic/ }).check();
    await page.getByRole('radio', { name: 'Input routine (VIR)' }).check();
    await page.getByLabel('Application').fill('SAMPLE.CUSTOMER');
    const field = page.getByLabel('Field', { exact: true });
    await field.selectOption('SC.NAME');
    await page.getByLabel('Application').fill('SAMPLE.CUSTOMERX');
    await page.getByLabel('Application').fill('SAMPLE.CUSTOMER');
    await expect(field).toHaveValue('');
  });

  test('the loaded release is remembered after a reload', async ({ page }) => {
    await page.goto('./?tool=artefact');
    await loadKnowledge(page);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'RTEST' })).toBeChecked();
    await expect(page.getByText('RTEST: 1 applications · 2 fields')).toBeVisible();
  });

  test('a file that is not a knowledge file is rejected with a message that stays', async ({
    page,
  }) => {
    await page.goto('./?tool=artefact');
    await page.locator('input[type=file][aria-label="Knowledge file"]').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello": "world"}'),
    });
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toContainText('notes.json');
    await expect(alert).toContainText('schemaVersion');
  });
});
