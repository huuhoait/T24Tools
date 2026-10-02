import { describe, expect, it } from 'vitest';
import {
  KnowledgeError,
  createKnowledgeStore,
  memoryAdapter,
  parseKnowledge,
} from './knowledgeStore';

const sample = (release, extra = {}) =>
  JSON.stringify({
    release,
    schemaVersion: 3,
    apps: {
      SAMPLE: {
        prefix: 'SM.',
        recordClass: 'Sample',
        components: [],
        fields: [
          [1, 'SM.NAME', 'Sample_Name', 'TField', 'Yes', null, 'SV'],
          [2, 'SM.LINES', 'Sample_Lines', null, null, null, 'MV'],
        ],
      },
    },
    ...extra,
  });

describe('parseKnowledge', () => {
  it('accepts a schemaVersion 3 export and counts apps and fields', () => {
    const k = parseKnowledge(sample('R25'));
    expect(k.release).toBe('R25');
    expect(k.appCount).toBe(1);
    expect(k.fieldCount).toBe(2);
  });

  it('rejects older exports with a re-export hint', () => {
    expect(() => parseKnowledge(sample('R25', { schemaVersion: 2 }))).toThrow(/re-export/);
  });

  it('rejects files with no release, no apps, or that are not JSON', () => {
    expect(() => parseKnowledge(sample(''))).toThrow(KnowledgeError);
    expect(() => parseKnowledge(JSON.stringify({ release: 'R25', schemaVersion: 3 }))).toThrow(
      /apps/,
    );
    expect(() => parseKnowledge('not json')).toThrow(/not a JSON/);
  });
});

describe('createKnowledgeStore', () => {
  it('keeps one knowledge file per release and lists releases in order', async () => {
    const store = createKnowledgeStore(memoryAdapter());
    await store.loadText(sample('R25'));
    await store.loadText(sample('R23'));
    expect(await store.listReleases()).toEqual(['R23', 'R25']);
    expect((await store.get('R25')).apps.SAMPLE.recordClass).toBe('Sample');
  });

  it('a reload finds what was stored before', async () => {
    const adapter = memoryAdapter();
    await createKnowledgeStore(adapter).loadText(sample('R25'));
    const again = createKnowledgeStore(adapter);
    expect(await again.listReleases()).toEqual(['R25']);
    expect((await again.get('R25')).release).toBe('R25');
  });

  it('works for the session when storage is blocked, and says it was not remembered', async () => {
    const broken = {
      async put() {
        throw new Error('blocked');
      },
      async get() {
        throw new Error('blocked');
      },
      async keys() {
        throw new Error('blocked');
      },
      async delete() {
        throw new Error('blocked');
      },
    };
    const store = createKnowledgeStore(broken);
    const result = await store.loadText(sample('R25'));
    expect(result.persisted).toBe(false);
    expect(await store.listReleases()).toEqual(['R25']);
    expect((await store.get('R25')).release).toBe('R25');
  });

  it('removes a release', async () => {
    const store = createKnowledgeStore(memoryAdapter());
    await store.loadText(sample('R25'));
    await store.remove('R25');
    expect(await store.listReleases()).toEqual([]);
  });
});
