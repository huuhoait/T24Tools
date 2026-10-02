// The only module that reads field data from a loaded knowledge file. The rules match
// render.js: jBC needs a componentised name, Java needs a single-value getter.

/** Application names matching `query` (case-insensitive); prefix matches first, then A-Z. */
export function listApps(knowledge, query = '', limit = 50) {
  const q = query.trim().toUpperCase();
  const names = Object.keys(knowledge?.apps || {});
  const matches = q ? names.filter((name) => name.includes(q)) : names;
  return matches
    .sort((a, b) => {
      const pa = a.startsWith(q) ? 0 : 1;
      const pb = b.startsWith(q) ? 0 : 1;
      return pa - pb || a.localeCompare(b);
    })
    .slice(0, limit);
}

/**
 * Fields of one app for a language: { name, position, kind, code, disabled }.
 * `code` is what the generated source will contain; `disabled` is a reason (or '').
 */
export function fieldsFor(knowledge, app, language) {
  const entry = knowledge?.apps?.[app];
  if (!entry) return [];
  const release = knowledge.release;
  return entry.fields.map(([position, name, alias, type, mandatory, jbcName, kind]) => {
    let code = name;
    let disabled = '';
    if (language === 'jbc') {
      code = jbcName || '';
      if (!jbcName) disabled = `no jBC name in ${release}`;
    } else if (language === 'java') {
      code = alias && alias.includes('_') ? `get${alias.slice(alias.indexOf('_') + 1)}()` : '';
      if (kind == null) disabled = 'no single-value getter';
      else if (kind !== 'SV') disabled = `multi-value (${kind})`;
    }
    return { name, position, kind: kind || null, type, mandatory, code, disabled };
  });
}
