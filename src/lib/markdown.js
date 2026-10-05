// Markdown → safe HTML, as RepoMind's Markdown viewer does it: marked parses, DOMPurify sanitises,
// ```mermaid fences become <div class="mermaid"> for renderMermaidBlocks (services/diagram.js).
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { escapeHtml } from './text';

export function renderMarkdown(value) {
  const renderer = new marked.Renderer();
  renderer.code = function ({ text, lang }) {
    if (lang && lang.toLowerCase() === 'mermaid')
      return '<div class="mermaid">' + escapeHtml(text) + '</div>';
    return (
      '<pre><code class="language-' +
      escapeHtml(lang || '') +
      '">' +
      escapeHtml(text) +
      '</code></pre>'
    );
  };
  return DOMPurify.sanitize(marked.parse(value || '', { renderer, gfm: true }), {
    ADD_TAGS: ['div'],
    ADD_ATTR: ['class'],
  });
}
