// Vite plugin: publish the R23 / R25 knowledge files kept in docs/t24tools/ with the site, at
// knowledge/<R>/fields.json, so the header can link to them and the tools can load them in one
// click. docs/ stays the only copy in the repo: a build copies the files into the output folder
// (so GitHub Pages and the E2E preview serve them), and the dev server serves them from docs/.

import { copyFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SITE_RELEASES, siteKnowledgePath } from '../lib/siteKnowledge.js';

export function knowledgeFiles(root) {
  return SITE_RELEASES.flatMap((release) =>
    ['fields.json', 'manifest.json'].map((file) => ({
      source: join(root, 'docs', 't24tools', release, file),
      target: siteKnowledgePath(release, file),
    })),
  );
}

export function knowledgeFilesPlugin() {
  let config;
  return {
    name: 't24tools-knowledge-files',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      const files = knowledgeFiles(config.root);
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0]);
        const file = files.find((f) => path === config.base + f.target);
        if (!file || !existsSync(file.source)) return next();
        res.setHeader('Content-Type', 'application/json');
        createReadStream(file.source).pipe(res);
      });
    },
    closeBundle() {
      if (config.command !== 'build') return;
      const outDir = resolve(config.root, config.build.outDir);
      for (const { source, target } of knowledgeFiles(config.root)) {
        const dest = join(outDir, target);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(source, dest);
      }
    },
  };
}
