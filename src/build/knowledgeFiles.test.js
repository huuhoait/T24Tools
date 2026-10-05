import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_RELEASES, siteKnowledgePath } from '../lib/siteKnowledge';
import { knowledgeFiles } from './knowledgeFiles';

const root = new URL('../../', import.meta.url);

describe('published knowledge files', () => {
  it('maps each release fields.json and manifest.json from docs/t24tools to knowledge/', () => {
    const files = knowledgeFiles('/repo');
    expect(files.map((f) => f.target)).toEqual(
      SITE_RELEASES.flatMap((r) => [siteKnowledgePath(r), siteKnowledgePath(r, 'manifest.json')]),
    );
    expect(files[0].source.split(sep).join('/')).toBe('/repo/docs/t24tools/R23/fields.json');
  });

  it.each(SITE_RELEASES)('%s fields.json matches the SHA-256 in its manifest', (release) => {
    const dir = new URL(`docs/t24tools/${release}/`, root);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
    const bytes = readFileSync(new URL('fields.json', dir));
    expect(manifest.release).toBe(release);
    expect(bytes.length).toBe(manifest.files['fields.json'].bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      manifest.files['fields.json'].sha256,
    );
  });
});
