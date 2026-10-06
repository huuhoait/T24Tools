import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const ROUTINE_FIXTURE = new URL('./fixtures/ACCOUNT.EXTRACT.b', import.meta.url);

// One T24 log line in the format the Log Analyzer parses, carrying an OFS application message.
const OFS_LOG_LINE =
  '[INFO ]20260901 10:15:30.1234 42 [S1] [INPUTTER] [OFS.MODULE] OFS request ' +
  '<ofsApplication><application>FUNDS.TRANSFER</application><version>FUNDS.TRANSFER,</version>' +
  '<ofsFunction>I</ofsFunction><transactionId>FT26244ABCDE</transactionId>' +
  '<companyId>GB0010001</companyId><message><field><fieldName>DEBIT.ACCOUNT</fieldName>' +
  '<value>12345</value></field></message></ofsApplication>';

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('T24Tools shell', () => {
  test('header has exactly the eight T24 tools and no codebase features', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('./');
    await expect(page.locator('header')).toContainText('T24Tools');
    const nav = page.getByRole('navigation', { name: 'Tools' });
    await expect(nav.getByRole('button')).toHaveText([
      'Routine Creator',
      'Routine Builder',
      'Artefact Generator',
      'OFS Message Generator',
      'T24 Log Analyzer',
      'Application Viewer',
      'JAR Viewer',
      'Markdown Viewer',
    ]);
    await expect(nav.getByRole('button', { name: 'Routine Creator' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const absent of ['Open Folder', 'GitHub Repository', 'Codebase', 'Dashboard'])
      await expect(page.getByRole('button', { name: absent })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('theme toggle cycles System, Light and Dark and is remembered', async ({ page }) => {
    await page.goto('./');
    const toggle = page.locator('header .theme-toggle');
    await expect(toggle).toHaveText(/System/);
    await toggle.click();
    await expect(toggle).toHaveText(/Light/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('t24tools.theme'))).toBe('dark');
    await page.locator('header .theme-toggle').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });

  test('a RepoMind theme carries over once', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('repomind.theme', 'dark');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('repomind.theme'))).toBe('dark');
  });

  test('?tool= deep links open a tool', async ({ page }) => {
    await page.goto('./?tool=log');
    await expect(page.getByRole('heading', { level: 1, name: /T24 and TAFJ logs/ })).toBeVisible();
    await page.goto('./?tool=ofs');
    await expect(page.getByRole('heading', { level: 1, name: /OFS messages/ })).toBeVisible();
  });
});

test.describe('Routine Creator', () => {
  test('generates a routine from the form and validates it', async ({ page }) => {
    await page.goto('./');
    await page.getByLabel('Routine name').fill('ACCOUNT.BALANCE');
    await page.getByRole('button', { name: '+ Field' }).click();
    await page.getByLabel('Field name 1').fill('AC.CUSTOMER');
    await page.getByLabel('Field position 1').fill('1');
    const output = page.locator('textarea.routine-output');
    await expect(output).toHaveValue(/SUBROUTINE ACCOUNT\.BALANCE/);
    await expect(output).toHaveValue(/Y\.AC\.CUSTOMER = R\.ACC<1>/);
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('✓ Configuration valid')).toBeVisible();
  });

  test('opens an existing routine, reports what it could not map, and keeps it across tabs', async ({
    page,
  }) => {
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('./');
    await page.getByLabel('Open existing routine').setInputFiles(fileURLToPath(ROUTINE_FIXTURE));
    const report = page.getByRole('region', { name: 'Imported routine' });
    await expect(report).toContainText('Imported ACCOUNT.EXTRACT.b');
    await expect(report.getByRole('list', { name: 'Mapped', exact: true })).toContainText(
      'Table ACCOUNT',
    );
    await expect(report.getByRole('list', { name: 'Not mapped' })).toContainText(
      'CALL ACCOUNT.EXTRACT.HELPER is not represented by the creator.',
    );
    await expect(page.getByLabel('Routine name')).toHaveValue('ACCOUNT.EXTRACT');
    await expect(page.getByLabel('Developer')).toHaveValue('Zain Kamali');
    await expect(page.getByLabel('Field position 1')).toHaveValue('1');
    await expect(page.getByLabel('Field position 2')).toHaveValue('');
    await expect(page.locator('textarea.routine-output')).toHaveValue(
      /\* Field position not verified: AC\.ONLINE\.ACTUAL\.BAL/,
    );

    await page.getByRole('button', { name: 'T24 Log Analyzer' }).click();
    await page.getByRole('button', { name: 'Routine Creator' }).click();
    await expect(page.getByLabel('Routine name')).toHaveValue('ACCOUNT.EXTRACT');
    // The routine was read locally: every request stayed on this site.
    expect(requests.every((url) => url.startsWith('http://127.0.0.1:4791/'))).toBe(true);
  });

  test('copies an existing routine under a new name with a preview and a diff', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByLabel('Open existing routine').setInputFiles({
      name: 'ACCOUNT.EXTRACT.b',
      mimeType: 'text/plain',
      buffer: readFileSync(ROUTINE_FIXTURE),
    });
    await page.getByRole('tab', { name: 'Copy with new name' }).click();
    const newName = page.getByLabel('New routine name');
    await expect(newName).toHaveValue('ACCOUNT.EXTRACT');
    await expect(page.getByText('The new name is the same as the current name.')).toBeVisible();
    await expect(page.getByRole('button', { name: '⬇ Download' })).toBeDisabled();

    await newName.fill('ACCOUNT.EXTRACT.V2');
    const preview = page.getByLabel('Renamed routine');
    await expect(preview).toHaveValue(/ {4}SUBROUTINE ACCOUNT\.EXTRACT\.V2\n/);
    await expect(preview).toHaveValue(/CALL ACCOUNT\.EXTRACT\.HELPER\(Y\.ACC\.ID, Y\.BALANCE\)/);
    await expect(preview).toHaveValue(/CRT "ACCOUNT\.EXTRACT\.V2 finished"/);
    await expect(preview).toHaveValue(/FN\.ACC = "F\.ACCOUNT"/);

    const changes = page.getByLabel('Changes');
    await expect(changes).toContainText('3 changed lines');
    await expect(changes).toContainText('- *  Program               : ACCOUNT.EXTRACT');
    await expect(changes).toContainText('+     SUBROUTINE ACCOUNT.EXTRACT.V2');
    await expect(changes).not.toContainText('HELPER');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '⬇ Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('ACCOUNT.EXTRACT.V2.b');
    const saved = readFileSync(await download.path(), 'utf8');
    expect(saved).toBe(
      readFileSync(ROUTINE_FIXTURE, 'utf8').replace(
        /(?<![\w.])ACCOUNT\.EXTRACT(?![\w]|\.\w)/g,
        'ACCOUNT.EXTRACT.V2',
      ),
    );
  });

  test('rejects a binary file', async ({ page }) => {
    await page.goto('./');
    await page.getByLabel('Open existing routine').setInputFiles({
      name: 'image.b',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0x4d, 0x5a, 0x00, 0x01]),
    });
    await expect(page.getByRole('alert')).toContainText('not a text routine');
    await expect(page.getByRole('region', { name: 'Imported routine' })).toHaveCount(0);
  });
});

test.describe('OFS Message Generator', () => {
  test('builds a message as the form is filled, saves it without the password and loads it', async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto('./?tool=ofs');
    await expect(page.locator('iframe')).toHaveCount(0);
    const output = page.getByLabel('Generated OFS message');
    await expect(output).toContainText('Enter an application');

    await page.getByLabel('Application').fill('FUNDS.TRANSFER');
    await page.getByLabel('Version').fill('TEST');
    await page.getByLabel('User', { exact: true }).fill('INPUTT');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: '+ Field' }).click();
    await page.getByLabel('Field name 1').fill('NARRATIVE');
    await page.getByLabel('Field 1 value 1', { exact: true }).fill('a,b');
    await page.getByLabel('Field 1 value 1 multi-value').fill('2');
    await expect(output).toHaveText('FUNDS.TRANSFER,TEST/I/PROCESS,INPUTT/secret,,NARRATIVE:2=a?b');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('t24tools.ofs.config'));
    expect(saved).toContain('FUNDS.TRANSFER');
    expect(saved).not.toContain('secret');

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByLabel('Application')).toHaveValue('');
    await page.getByRole('button', { name: 'Load saved' }).click();
    await expect(page.getByLabel('Field name 1')).toHaveValue('NARRATIVE');
    await expect(output).toHaveText('FUNDS.TRANSFER,TEST/I/PROCESS,INPUTT/,,NARRATIVE:2=a?b');
    expect(errors).toEqual([]);
  });

  test('parses a pasted message into the form', async ({ page }) => {
    await page.goto('./?tool=ofs');
    await page
      .getByLabel('OFS message to parse')
      .fill('ENQUIRY.SELECT,,TEST.USER/654321,,ACCOUNT.NUMBER EQ 123');
    await page.getByRole('button', { name: 'Parse into form' }).click();
    await expect(page.getByRole('tab', { name: 'Enquiry' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Selection criteria')).toHaveValue('ACCOUNT.NUMBER EQ 123');
    const summary = page.getByLabel('Parsed message');
    await expect(summary).toContainText('TEST.USER / ••••');
    await expect(summary).not.toContainText('654321');
  });

  test('loads a configuration saved by RepoMind', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(
          'repomind.ofs.config',
          JSON.stringify({ type: 'Transaction', fields: [], application: 'CUSTOMER', fn: 'I' }),
        );
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('./?tool=ofs');
    await page.getByRole('button', { name: 'Load saved' }).click();
    await expect(page.getByLabel('Application')).toHaveValue('CUSTOMER');
  });
});

test.describe('T24 Log Analyzer', () => {
  test('hands an OFS message from a log entry to the OFS Generator', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('./');
    await page.getByRole('button', { name: 'T24 Log Analyzer' }).click();
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.getByLabel('Paste log content').fill(OFS_LOG_LINE);
    const column = page.getByRole('region', { name: 'Pasted content' });
    await expect(column).toContainText('1 entry');
    await column.getByRole('button', { name: /OFS request/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('FT26244ABCDE');
    await expect(dialog.getByRole('cell', { name: 'DEBIT.ACCOUNT' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Open in OFS Generator' }).click();

    await expect(
      page.getByRole('navigation', { name: 'Tools' }).getByRole('button', {
        name: 'OFS Message Generator',
      }),
    ).toHaveAttribute('aria-current', 'page');
    // The Routine Creator stays mounted (hidden), so labels are matched exactly.
    await expect(page.getByRole('heading', { level: 1, name: /OFS messages/ })).toBeVisible();
    const label = (name) => page.getByLabel(name, { exact: true });
    await expect(label('Application')).toHaveValue('FUNDS.TRANSFER');
    await expect(label('Version')).toHaveValue('');
    await expect(label('Transaction / record ID')).toHaveValue('FT26244ABCDE');
    await expect(label('Company')).toHaveValue('GB0010001');
    await expect(page.getByLabel('Generated OFS message')).toHaveText(
      'FUNDS.TRANSFER,/I/PROCESS,//GB0010001,FT26244ABCDE,DEBIT.ACCOUNT=12345',
    );
    // The handoff is consumed once.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('t24tools.t24.ofsContext')))
      .toBeNull();
    expect(errors).toEqual([]);
  });

  test('reads several files side by side and filters them together', async ({ page }) => {
    await page.goto('./?tool=log');
    const line = (level, text) =>
      `[${level}]20260901 10:15:30.1234 1 [S1] [INPUTTER] [MOD] ${text}`;
    await page.getByLabel('Log files').setInputFiles([
      {
        name: 'one.log',
        mimeType: 'text/plain',
        buffer: Buffer.from([line('INFO ', 'started'), line('ERROR', 'broke')].join('\n')),
      },
      { name: 'two.log', mimeType: 'text/plain', buffer: Buffer.from(line('INFO ', 'other')) },
    ]);
    await expect(page.getByRole('region', { name: 'one.log' })).toContainText('2 entries');
    await expect(page.getByRole('region', { name: 'two.log' })).toContainText('1 entry');

    await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: 'ERROR' }).click();
    await expect(page.getByRole('region', { name: 'one.log' })).toContainText('1 of 2');
    await expect(page.getByRole('region', { name: 'two.log' })).toContainText('No entries match');

    await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: 'All' }).click();
    await page.getByLabel('Filter entries').fill('other');
    await expect(page.getByRole('region', { name: 'two.log' })).toContainText('1 entry');
    await expect(page.getByRole('region', { name: 'one.log' })).toContainText('0 of 2');

    await page.getByRole('button', { name: 'Remove two.log' }).click();
    await expect(page.getByRole('region', { name: 'two.log' })).toHaveCount(0);
  });
});
