// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('keeps code blocks as text and marks mermaid blocks', () => {
    const html = renderMarkdown('```js\n<b>x</b>\n```\n\n```mermaid\ngraph TD; A-->B\n```');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('class="mermaid"');
  });
  it('renders GFM tables and nested lists with code', () => {
    const html = renderMarkdown(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n1. step\n   ```\n   run\n   ```',
    );
    expect(html).toContain('<table>');
    expect(html).toMatch(/<li>[\s\S]*<pre><code/);
  });
  it('strips scripts and event handlers', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(2)">\n\nok');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('ok');
  });
});
