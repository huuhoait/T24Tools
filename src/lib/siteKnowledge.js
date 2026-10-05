// Knowledge files published with the site (copied from docs/t24tools/<R>/ at build time by
// src/build/knowledgeFiles.js). Pure module: imported by the browser code and by vite.config.js.

export const SITE_RELEASES = ['R23', 'R25'];

/** Path of a published release file, relative to the app's base URL (`knowledge/R23/fields.json`). */
export function siteKnowledgePath(release, file = 'fields.json') {
  return `knowledge/${release}/${file}`;
}
