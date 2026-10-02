// Field check for generated (or pasted) Infobasic / jBC source, against a loaded knowledge file.
// Port of Temenos-Skills pipeline/artefact_fields.py: legacy EQU names (AC.CATEGORY) are checked
// against the app's fields, componentised names (AC.AccountOpening.Account.Category) against the
// app's jBC names. Java is not checked here -- javac against the record classes is its gate.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stripComments(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*[*!]/.test(line))
    .map((line) => line.split(';*')[0])
    .join('\n');
}

export function extractRefs(source, prefix, recordClass) {
  const code = stripComments(source);
  const legacy = new Set();
  if (prefix) {
    const re = new RegExp(
      `(?<![\\w.])${escapeRe(prefix)}[A-Z0-9]+(?:\\.[A-Z0-9]+)*(?![\\w.(])`,
      'g',
    );
    for (const m of code.matchAll(re)) legacy.add(m[0]);
  }
  const compRe = new RegExp(
    `\\b[A-Z]{2,}\\.[A-Z][A-Za-z0-9]*\\.${escapeRe(recordClass)}\\.[A-Z][A-Za-z0-9]*\\b(?!\\s*\\()`,
    'g',
  );
  const componentised = new Set([...code.matchAll(compRe)].map((m) => m[0]));
  return { legacy, componentised };
}

/** { verified: [...], missing: [...] } sorted; { error } when the app is not in the release. */
export function checkFields(knowledge, app, source) {
  const entry = knowledge?.apps?.[app];
  if (!entry)
    return { error: `${app} is not an application in ${knowledge?.release || 'this release'}` };
  const refs = extractRefs(source, entry.prefix, entry.recordClass);
  const names = new Set(entry.fields.map((f) => f[1]));
  const jbcNames = new Set(entry.fields.map((f) => f[5]).filter(Boolean));
  const verified = [];
  const missing = [];
  for (const ref of refs.legacy) (names.has(ref) ? verified : missing).push(ref);
  for (const ref of refs.componentised) (jbcNames.has(ref) ? verified : missing).push(ref);
  return { verified: verified.sort(), missing: missing.sort() };
}
