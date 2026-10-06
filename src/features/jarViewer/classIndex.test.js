import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HIDDEN_TYPES,
  classesInJar,
  compareReleases,
  decodeClassIndex,
  isJarQuery,
  listJars,
  searchClasses,
  visibleTypesAfterLoad,
} from './classIndex';

// Synthetic index in the classes.json format (no Temenos data).
const doc = (release, rows, jars = ['A_Hook.jar', 'B_Core.jar', 'C_Dup.jar']) => ({
  kind: 't24-classes',
  schemaVersion: 1,
  release,
  generated: '2026-10-05T00:00:00Z',
  jars,
  packages: ['com.x.hook', 'com.x.core'],
  types: ['hook', 'internal', 'public-api'],
  classes: rows,
});
const R23 = doc('R23', [
  [
    'Lifecycle',
    0,
    0,
    0,
    0,
    'com.x.core.Context',
    [],
    [['checkId', 'java.lang.String', ['java.lang.String']]],
  ],
  ['LifecycleHelper', 1, 1, 1, 2, '', ['com.x.hook.Lifecycle']],
  ['Context', 1, 1, 2, 0, '', [], []],
  ['Shared', 1, 1, 1, 1, '', []],
  ['Shared', 1, 2, 1, 1, '', []],
  ['MyLifecycleUtil', 1, 1, 2, 0, '', [], []],
]);

describe('decodeClassIndex', () => {
  it('expands tuples into entries with flags and methods', () => {
    const index = decodeClassIndex(R23);
    const [hook] = index.byQualified.get('com.x.hook.Lifecycle');
    expect(hook).toMatchObject({
      name: 'Lifecycle',
      package: 'com.x.hook',
      jar: 'A_Hook.jar',
      type: 'hook',
      isInterface: false,
      isAbstract: false,
      superclass: 'com.x.core.Context',
      methods: [['checkId', 'java.lang.String', ['java.lang.String']]],
    });
    const [helper] = index.byQualified.get('com.x.core.LifecycleHelper');
    expect(helper).toMatchObject({ isAbstract: true, methods: null });
  });

  it('keeps a class found in two JARs as two entries', () => {
    const shared = decodeClassIndex(R23).byQualified.get('com.x.core.Shared');
    expect(shared.map((c) => c.jar)).toEqual(['B_Core.jar', 'C_Dup.jar']);
  });

  it('rejects a fields.json and an unknown schema version with a readable message', () => {
    expect(() => decodeClassIndex({ release: 'R23', apps: {} })).toThrow(
      /isn't a classes\.json.*Application Viewer/,
    );
    expect(() => decodeClassIndex({ ...R23, schemaVersion: 9 })).toThrow(/version 9.*version 1/);
  });
});

describe('searchClasses', () => {
  const index = decodeClassIndex(R23);
  it('ranks exact name, then prefix, then contains — case-insensitive', () => {
    const names = searchClasses(index, 'lifecycle').results.map((c) => c.name);
    expect(names).toEqual(['Lifecycle', 'LifecycleHelper', 'MyLifecycleUtil']);
  });
  it('matches a fully-qualified name and a JAR name', () => {
    expect(searchClasses(index, 'COM.X.HOOK.LIFECYCLE').results[0].qualified).toBe(
      'com.x.hook.Lifecycle',
    );
    expect(searchClasses(index, 'c_dup').results.map((c) => c.jar)).toEqual(['C_Dup.jar']);
  });
  it('filters by type and caps the list but reports the total', () => {
    const shown = new Set(['hook', 'public-api']);
    expect(searchClasses(index, 'life', { types: shown }).results.map((c) => c.name)).toEqual([
      'Lifecycle',
      'MyLifecycleUtil',
    ]);
    const capped = searchClasses(index, 'li', { limit: 2 });
    expect(capped.results).toHaveLength(2);
    expect(capped.total).toBeGreaterThan(2);
    expect(DEFAULT_HIDDEN_TYPES).toEqual(['internal', 'test']);
  });
  it('needs at least two characters', () => {
    expect(searchClasses(index, ' x ')).toEqual({ results: [], total: 0 });
  });
});

describe('JAR mode', () => {
  const index = decodeClassIndex(R23);
  it('recognises a JAR name with or without .jar, any case', () => {
    expect(isJarQuery(index, 'b_core.jar')).toBe('B_Core.jar');
    expect(isJarQuery(index, 'B_CORE')).toBe('B_Core.jar');
    expect(isJarQuery(index, 'Lifecycle')).toBeNull();
  });
  it('lists the classes of a JAR grouped by package', () => {
    const groups = classesInJar(index, 'A_Hook.jar');
    expect([...groups.keys()]).toEqual(['com.x.hook']);
    expect(groups.get('com.x.hook').map((c) => c.name)).toEqual(['Lifecycle']);
  });
  it('lists only the shown types of a JAR when types are given', () => {
    const all = classesInJar(index, 'B_Core.jar');
    expect(all.get('com.x.core').map((c) => c.name)).toEqual([
      'LifecycleHelper',
      'Context',
      'Shared',
      'MyLifecycleUtil',
    ]);
    const api = classesInJar(index, 'B_Core.jar', new Set(['public-api']));
    expect(api.get('com.x.core').map((c) => c.name)).toEqual(['Context', 'MyLifecycleUtil']);
  });
});

describe('listJars', () => {
  const index = decodeClassIndex(R23);
  it('lists every JAR by name with its class count', () => {
    expect(listJars(index)).toEqual([
      { jar: 'A_Hook.jar', count: 1 },
      { jar: 'B_Core.jar', count: 4 },
      { jar: 'C_Dup.jar', count: 1 },
    ]);
  });
  it('filters by part of the name, any case, and counts only the shown types', () => {
    expect(listJars(index, 'core')).toEqual([{ jar: 'B_Core.jar', count: 4 }]);
    expect(listJars(index, 'B_CORE.JAR', { types: new Set(['public-api']) })).toEqual([
      { jar: 'B_Core.jar', count: 2 },
    ]);
  });
});

describe('compareReleases', () => {
  it('marks same, moved, and one-release-only classes', () => {
    const a = decodeClassIndex(R23);
    const b = decodeClassIndex(
      doc(
        'R25',
        [
          ['Lifecycle', 0, 0, 0, 0, '', []],
          ['Context', 1, 2, 2, 0, '', []],
          ['NewOne', 1, 1, 2, 0, '', []],
        ],
        ['A_Hook.jar', 'B_Core.jar', 'D_New.jar'],
      ),
    );
    const diff = compareReleases(a, b);
    expect(diff.get('com.x.hook.Lifecycle')).toEqual({
      status: 'same',
      a: ['A_Hook.jar'],
      b: ['A_Hook.jar'],
    });
    expect(diff.get('com.x.core.Context')).toEqual({
      status: 'moved',
      a: ['B_Core.jar'],
      b: ['D_New.jar'],
    });
    expect(diff.get('com.x.core.NewOne').status).toBe('onlyB');
    expect(diff.get('com.x.core.Shared').status).toBe('onlyA');
  });
});

describe('visibleTypesAfterLoad', () => {
  it('starts with every type except the hidden ones', () => {
    expect([...visibleTypesAfterLoad(null, [], ['hook', 'internal', 'test', 'tafj'])]).toEqual([
      'hook',
      'tafj',
    ]);
  });
  it('shows a type that a later release brings, and keeps the user’s choices', () => {
    const shown = new Set(['public-api']); // the user unticked hook
    const next = visibleTypesAfterLoad(
      shown,
      [['hook', 'internal', 'public-api']],
      ['hook', 'tafj'],
    );
    expect([...next].sort()).toEqual(['public-api', 'tafj']);
  });
});
