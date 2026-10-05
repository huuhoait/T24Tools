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
      SITE_RELEASES.flatMap((r) => [
        siteKnowledgePath(r),
        siteKnowledgePath(r, 'classes.json'),
        siteKnowledgePath(r, 'manifest.json'),
      ]),
    );
    expect(files[0].source.split(sep).join('/')).toBe('/repo/docs/t24tools/R23/fields.json');
  });

  it.each(
    SITE_RELEASES.flatMap((r) => [
      [r, 'fields.json'],
      [r, 'classes.json'],
    ]),
  )('%s %s matches the SHA-256 in its manifest', (release, file) => {
    const dir = new URL(`docs/t24tools/${release}/`, root);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
    const bytes = readFileSync(new URL(file, dir));
    expect(manifest.release).toBe(release);
    expect(bytes.length).toBe(manifest.files[file].bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.files[file].sha256);
  });
});
