import { expect, test } from '@playwright/test';

test.describe('Markdown Viewer', () => {
  test('renders pasted markdown, a mermaid diagram, and never runs scripts', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => errors.push('dialog: ' + d.message()));
    await page.goto('./?tool=md');
    await page
      .getByLabel('Markdown source')
      .fill(
        '# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```mermaid\ngraph TD; A-->B\n```\n\n```mermaid\nnot a diagram ((\n```\n\n<img src=x onerror="alert(1)">',
      );
    const sheet = page.getByRole('article', { name: 'Rendered markdown' });
    await expect(sheet.getByRole('heading', { name: 'Title' })).toBeVisible();
    await expect(sheet.locator('table')).toBeVisible();
    await expect(sheet.locator('.mermaid svg').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.md-tab')).toHaveText('pasted.md');
    expect(errors).toEqual([]);
  });

  test('uploaded .md files are listed and switchable', async ({ page }) => {
    await page.goto('./?tool=md');
    await page.locator('input[type=file][aria-label="Markdown file"]').setInputFiles([
      { name: 'one.md', mimeType: 'text/markdown', buffer: Buffer.from('# One') },
      { name: 'two.md', mimeType: 'text/markdown', buffer: Buffer.from('# Two') },
    ]);
    const list = page.getByRole('list', { name: 'Markdown files' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
    await list.getByRole('button', { name: /^two\.md/ }).click();
    await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();
    await expect(page.locator('.md-tab')).toHaveText('two.md');
  });
});
