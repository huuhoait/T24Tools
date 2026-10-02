// Knowledge files: the per-release field data (fields.json, schemaVersion 3) exported by
// Temenos-Skills (pipeline/export_t24tools.py). They are Temenos-derived, so T24Tools never
// bundles or uploads them: the developer picks the file from disk and it is kept in this
// browser (IndexedDB), one copy per release. If storage is blocked the file still works for
// the session.

export const KNOWLEDGE_SCHEMA_VERSION = 3;

export class KnowledgeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'KnowledgeError';
  }
}

export function parseKnowledge(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new KnowledgeError(
      'This is not a JSON knowledge file (expected fields.json from Temenos-Skills).',
    );
  }
  if (!doc || typeof doc !== 'object') throw new KnowledgeError('The knowledge file is empty.');
  if (doc.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION)
    throw new KnowledgeError(
      `This knowledge file is schemaVersion ${doc.schemaVersion ?? 'unknown'}; T24Tools needs version ` +
        `${KNOWLEDGE_SCHEMA_VERSION}. Please re-export it with: python pipeline/release_t24tools.py --release <R>`,
    );
  if (typeof doc.release !== 'string' || !doc.release.trim())
    throw new KnowledgeError('The knowledge file does not say which T24 release it describes.');
  if (!doc.apps || typeof doc.apps !== 'object' || !Object.keys(doc.apps).length)
    throw new KnowledgeError('The knowledge file has no apps.');
  const apps = Object.values(doc.apps);
  return {
    ...doc,
    appCount: apps.length,
    fieldCount: apps.reduce((n, app) => n + (app.fields?.length || 0), 0),
  };
}

/** In-memory adapter (tests, and the fallback when IndexedDB is unavailable). */
export function memoryAdapter() {
  const data = new Map();
  return {
    async put(key, value) {
      data.set(key, value);
    },
    async get(key) {
      return data.get(key);
    },
    async keys() {
      return [...data.keys()];
    },
    async delete(key) {
      data.delete(key);
    },
  };
}

const DB_NAME = 't24tools-knowledge';
const STORE = 'releases';

/** IndexedDB adapter: one record per release, keyed by release name. */
export function indexedDbAdapter(indexedDB = globalThis.indexedDB) {
  const open = () =>
    new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error('IndexedDB is not available'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const run = async (mode, action) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    put: (key, value) => run('readwrite', (s) => s.put(value, key)),
    get: (key) => run('readonly', (s) => s.get(key)),
    keys: () => run('readonly', (s) => s.getAllKeys()),
    delete: (key) => run('readwrite', (s) => s.delete(key)),
  };
}

export function createKnowledgeStore(adapter = indexedDbAdapter()) {
  const session = new Map(); // release -> parsed knowledge (also covers blocked storage)

  return {
    /** Parse, keep for the session and try to remember it. Returns { release, appCount, fieldCount, persisted }. */
    async loadText(text) {
      const knowledge = parseKnowledge(text);
      session.set(knowledge.release, knowledge);
      let persisted = true;
      try {
        await adapter.put(knowledge.release, text);
      } catch {
        persisted = false;
      }
      return {
        release: knowledge.release,
        appCount: knowledge.appCount,
        fieldCount: knowledge.fieldCount,
        persisted,
      };
    },

    async listReleases() {
      let stored = [];
      try {
        stored = await adapter.keys();
      } catch {
        stored = [];
      }
      return [...new Set([...stored.map(String), ...session.keys()])].sort();
    },

    async get(release) {
      if (session.has(release)) return session.get(release);
      let text;
      try {
        text = await adapter.get(release);
      } catch {
        text = undefined;
      }
      if (!text) return null;
      const knowledge = parseKnowledge(text);
      session.set(release, knowledge);
      return knowledge;
    },

    async remove(release) {
      session.delete(release);
      try {
        await adapter.delete(release);
      } catch {
        // storage blocked: nothing was stored
      }
    },
  };
}
