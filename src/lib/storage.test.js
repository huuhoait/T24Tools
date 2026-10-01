import { describe, expect, it } from 'vitest';
import { LEGACY_KEYS, MIGRATION_FLAG, migrateLegacyStorage } from './storage';

const memory = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
};

describe('legacy RepoMind storage migration', () => {
  it('maps every t24tools key to its RepoMind predecessor', () => {
    expect(LEGACY_KEYS).toEqual({
      't24tools.ofs.config': 'repomind.ofs.config',
      't24tools.t24.ofsContext': 'repomind.t24.ofsContext',
      't24tools.theme': 'repomind.theme',
    });
  });

  it('copies RepoMind values the new keys do not have yet, and keeps the old keys', () => {
    const storage = memory({
      'repomind.ofs.config': '{"application":"FT"}',
      'repomind.theme': 'dark',
    });
    expect(migrateLegacyStorage(storage)).toEqual(['t24tools.ofs.config', 't24tools.theme']);
    expect(storage.getItem('t24tools.ofs.config')).toBe('{"application":"FT"}');
    expect(storage.getItem('t24tools.theme')).toBe('dark');
    expect(storage.getItem('repomind.ofs.config')).toBe('{"application":"FT"}');
  });

  it('never overwrites a value T24Tools already has', () => {
    const storage = memory({ 'repomind.theme': 'dark', 't24tools.theme': 'light' });
    expect(migrateLegacyStorage(storage)).toEqual([]);
    expect(storage.getItem('t24tools.theme')).toBe('light');
  });

  it('runs once, so a consumed handoff is not copied back from RepoMind', () => {
    const storage = memory({ 'repomind.t24.ofsContext': '{"application":"FT"}' });
    expect(migrateLegacyStorage(storage)).toEqual(['t24tools.t24.ofsContext']);
    expect(storage.getItem(MIGRATION_FLAG)).toBe('1');
    storage.removeItem('t24tools.t24.ofsContext');
    expect(migrateLegacyStorage(storage)).toEqual([]);
    expect(storage.getItem('t24tools.t24.ofsContext')).toBeNull();
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(migrateLegacyStorage(blocked)).toEqual([]);
    expect(migrateLegacyStorage(undefined)).toEqual([]);
  });
});
