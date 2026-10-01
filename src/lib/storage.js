// T24Tools continues tools that used to live in RepoMind. Both apps are served from the same GitHub
// Pages origin, so settings saved by RepoMind are visible here under their old names. They are
// copied to the T24Tools names once; the RepoMind values are left untouched.
export const LEGACY_KEYS = Object.freeze({
  't24tools.ofs.config': 'repomind.ofs.config',
  't24tools.t24.ofsContext': 'repomind.t24.ofsContext',
  't24tools.theme': 'repomind.theme',
});

// Set after the first migration, so a handoff the OFS Generator has consumed (and removed) is not
// copied back from the old key on the next visit.
export const MIGRATION_FLAG = 't24tools.legacyImported';

/** Copies RepoMind values the T24Tools keys do not have yet. Returns the keys it wrote. */
export function migrateLegacyStorage(storage = globalThis.localStorage) {
  const copied = [];
  try {
    if (!storage || storage.getItem(MIGRATION_FLAG)) return copied;
    for (const [key, legacyKey] of Object.entries(LEGACY_KEYS)) {
      const legacy = storage.getItem(legacyKey);
      if (legacy === null || storage.getItem(key) !== null) continue;
      storage.setItem(key, legacy);
      copied.push(key);
    }
    storage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // Storage blocked (private mode, policy): there is nothing to carry over.
  }
  return copied;
}
