// Mermaid is bundled from npm and loaded on first use, so it adds nothing to the initial page load
// and never reaches out to a CDN (the CSP allows only this site).
import { STALE_BUILD_MESSAGE, isStaleBuildError } from '../lib/staleBuild';

let mermaidPromise = null;

export function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
        return mermaid;
      })
      .catch((error) => {
        mermaidPromise = null;
        throw new Error(
          isStaleBuildError(error)
            ? STALE_BUILD_MESSAGE
            : 'Unable to load the Mermaid renderer: ' + error.message,
        );
      });
  }
  return mermaidPromise;
}

/** Renders every `.mermaid` block inside `root` in place; a broken block shows its own error. */
export async function renderMermaidBlocks(root) {
  const nodes = root ? [...root.querySelectorAll('.mermaid:not([data-processed])')] : [];
  if (!nodes.length) return;
  const mermaid = await loadMermaid();
  await mermaid.run({ nodes, suppressErrors: true });
}
