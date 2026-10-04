// T24 reading of a JSON document: a fields.json knowledge file (see artefactGenerator/knowledgeStore)
// gets an applications index on top of the generic tree. Field tuples are
// [position, name, alias, type, mandatory, jbcName, kind], as catalog.js reads them.

export const FIELD_COLUMNS = ['#', 'Field', 'Property', 'Type', 'Mandatory', 'jBC name', 'Kind'];

/** True for a document shaped like a knowledge file: { apps: { NAME: { fields: [[…]] } } }. */
export function isKnowledgeFile(doc) {
  const apps = doc?.apps;
  if (!apps || typeof apps !== 'object' || Array.isArray(apps)) return false;
  for (const name in apps) return Array.isArray(apps[name]?.fields);
  return false;
}

/**
 * Fields whose name or jBC name contains `query`, across every application:
 * { results: [{ app, position, name }], total }.
 */
export function searchFields(doc, query, limit = 200) {
  const q = query.trim().toUpperCase();
  const results = [];
  let total = 0;
  if (q.length < 2) return { results, total };
  for (const [app, entry] of Object.entries(doc.apps)) {
    for (const field of entry.fields || []) {
      const [position, name, , , , jbcName] = field;
      if (
        String(name).toUpperCase().includes(q) ||
        (jbcName && String(jbcName).toUpperCase().includes(q))
      )
        if (total++ < limit) results.push({ app, position, name });
    }
  }
  return { results, total };
}

/** Summary line for the loaded file. */
export function knowledgeSummary(doc) {
  const apps = Object.values(doc.apps);
  return {
    release: typeof doc.release === 'string' ? doc.release : '',
    schemaVersion: doc.schemaVersion,
    appCount: apps.length,
    fieldCount: apps.reduce((n, app) => n + (app.fields?.length || 0), 0),
  };
}
