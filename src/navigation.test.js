import { describe, expect, it } from 'vitest';
import { NAV_TABS, initialTab } from './navigation';

describe('navigation', () => {
  it('has exactly the four T24 tools, in header order', () => {
    expect(NAV_TABS).toEqual([
      ['routine', 'Routine Creator'],
      ['artefact', 'Artefact Generator'],
      ['ofs', 'OFS Message Generator'],
      ['log', 'T24 Log Analyzer'],
    ]);
  });

  it('opens the tool named by ?tool=, and the Routine Creator otherwise', () => {
    expect(initialTab('?tool=ofs')).toBe('ofs');
    expect(initialTab('?tool=log')).toBe('log');
    expect(initialTab('?tool=routine')).toBe('routine');
    expect(initialTab('?tool=artefact')).toBe('artefact');
    expect(initialTab('?tool=codebase')).toBe('routine');
    expect(initialTab('')).toBe('routine');
  });
});
