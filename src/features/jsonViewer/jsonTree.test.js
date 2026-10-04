import { describe, expect, it } from 'vitest';
import {
  ROOT_ID,
  allContainerIds,
  ancestorIds,
  buildRows,
  childId,
  defaultExpanded,
  errorLocation,
  formatBytes,
  idOfPath,
  inlineText,
  pathLabel,
  pathOfId,
  rowIndexForPath,
  searchJson,
  stats,
  valueAt,
} from './jsonTree';

const DOC = {
  release: 'RTEST',
  apps: {
    'SAMPLE.CUSTOMER': {
      prefix: 'SC.',
      fields: [
        [1, 'SC.NAME', 'Sample_Name', 'TField', 'No', null, 'SV'],
        [2, 'SC.LINES', 'Sample_Lines', null, null, null, 'MV'],
      ],
    },
  },
};

const shape = (rows) => rows.map((r) => `${'  '.repeat(r.depth)}${r.type}:${r.key ?? ''}`);

describe('buildRows', () => {
  it('shows only the root when nothing is expanded', () => {
    expect(shape(buildRows(DOC, new Set()))).toEqual(['collapsed:']);
  });

  it('flattens expanded containers with open/close rows and prints short tuples inline', () => {
    const fieldsId = idOfPath(['apps', 'SAMPLE.CUSTOMER', 'fields']);
    const rows = buildRows(
      DOC,
      new Set([...ancestorIds(['apps', 'SAMPLE.CUSTOMER', 'fields', 0])]),
    );
    expect(ancestorIds(['apps', 'SAMPLE.CUSTOMER', 'fields', 0])).toContain(fieldsId);
    expect(shape(rows)).toEqual([
      'open:',
      '  leaf:release',
      '  open:apps',
      '    open:SAMPLE.CUSTOMER',
      '      leaf:prefix',
      '      open:fields',
      '        inline:',
      '        inline:',
      '      close:',
      '    close:',
      '  close:',
      'close:',
    ]);
    const tuples = rows.filter((r) => r.type === 'inline');
    expect(tuples[0].text).toBe('[1, "SC.NAME", "Sample_Name", "TField", "No", null, "SV"]');
    expect(tuples.map((r) => r.last)).toEqual([false, true]);
  });

  it('handles primitive and empty documents', () => {
    expect(shape(buildRows(null, new Set([ROOT_ID])))).toEqual(['leaf:']);
    expect(shape(buildRows([], new Set([ROOT_ID])))).toEqual(['inline:']);
    expect(shape(buildRows({}, new Set([ROOT_ID])))).toEqual(['open:', 'close:']);
  });
});

describe('inlineText', () => {
  it('keeps nested or long arrays multi-line', () => {
    expect(inlineText([1, [2]])).toBeNull();
    expect(inlineText(Array.from({ length: 20 }, (_, i) => i))).toBeNull();
    expect(inlineText(['x'.repeat(300)])).toBeNull();
    expect(inlineText({ a: 1 })).toBeNull();
  });
});

describe('search and reveal', () => {
  it('finds keys and values, case-insensitively, and caps the result list', () => {
    const { results, total } = searchJson(DOC, 'sc.', 1);
    expect(total).toBe(3); // prefix value + two field names
    expect(results).toEqual([{ path: ['apps', 'SAMPLE.CUSTOMER', 'prefix'], match: 'value' }]);
    expect(searchJson(DOC, 'release').results[0]).toEqual({ path: ['release'], match: 'key' });
    expect(searchJson(DOC, '   ').total).toBe(0);
  });

  it('expands the ancestors of a match and lands on the inline row holding it', () => {
    const path = ['apps', 'SAMPLE.CUSTOMER', 'fields', 1, 1];
    const rows = buildRows(DOC, new Set(ancestorIds(path)));
    const index = rowIndexForPath(rows, path);
    expect(rows[index].type).toBe('inline');
    expect(rows[index].value[1]).toBe('SC.LINES');
  });

  it('maps row ids back to paths and labels', () => {
    const path = ['apps', 'SAMPLE.CUSTOMER', 'fields', 0];
    const id = path.reduce(childId, ROOT_ID);
    expect(idOfPath(path)).toBe(id);
    expect(pathOfId(DOC, id)).toEqual(path);
    expect(valueAt(DOC, path)[1]).toBe('SC.NAME');
    expect(pathLabel(path)).toBe('apps["SAMPLE.CUSTOMER"].fields[0]');
    expect(pathLabel([])).toBe('(root)');
  });
});

describe('expansion and stats', () => {
  it('counts containers and values', () => {
    expect(stats(DOC)).toEqual({ objects: 3, arrays: 3, values: 16, maxDepth: 5 });
  });

  it('expands every container of a small document', () => {
    const ids = allContainerIds(DOC);
    expect(ids).toHaveLength(4); // root, apps, the app, its fields (tuples print inline)
    expect(defaultExpanded(DOC)).toEqual(new Set(ids));
    expect(allContainerIds(DOC, 2)).toBeNull();
  });

  it('opens only the root and modest first-level containers of a large document', () => {
    const big = {
      list: Array.from({ length: 3000 }, (_, i) => ({ i })),
      huge: Array.from({ length: 12_000 }, (_, i) => ({ i })),
      meta: { a: 1 },
    };
    expect(defaultExpanded(big)).toEqual(
      new Set([ROOT_ID, childId(ROOT_ID, 'list'), childId(ROOT_ID, 'meta')]),
    );
  });
});

describe('messages', () => {
  it('turns a parse position into a line and column', () => {
    expect(errorLocation('Unexpected token at position 3', 'ab\ncd')).toBe(' (line 2, column 1)');
    // Engines that already report the line and column are left alone.
    expect(errorLocation('Bad thing at position 9 (line 3 column 3)', 'x')).toBe('');
    expect(errorLocation('Unexpected end of JSON input', '{')).toBe('');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(19_439_675)).toBe('18.5 MB');
  });
});
