// Resolve and render artefact templates in the browser.
//
// This is a port of Temenos-Skills pipeline/artefact_templates.py (resolve + render) and must
// produce exactly the same values and files: render.test.js replays every golden case bundled
// in src/data/templates.json and compares against what the Python side produced (and compiled
// against a real R25 install).
//
// A `field` input resolves per language, for the selected release's knowledge file:
//   infobasic -> EQU name (EB.CUS.SECTOR)
//   jbc       -> componentised name (ST.Customer.Customer.EbCusSector)
//   java      -> getter suffix (Sector), single-value fields only
// Derived values: TODAY, <FIELD>_NAME (name without the app prefix, as OFS and SELECT use it),
// <APP>_COMPONENT / <APP>_RECORD (jBC), <APP>_CLASS / <APP>_PACKAGE and RECORD_CLASS /
// RECORD_PACKAGE (Java record classes).

const PLACEHOLDER = /{{([A-Z_]+)}}/g;

export class MissingInputs extends Error {
  constructor(missing) {
    const unique = [...new Set(missing)].sort();
    super(`Missing inputs: ${unique.join(', ')}`);
    this.name = 'MissingInputs';
    this.missing = unique;
  }
}

export class FieldNotAvailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'FieldNotAvailable';
  }
}

export function recordClass(app) {
  return app
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function appEntry(knowledge, app) {
  return knowledge?.apps?.[app];
}

// Field tuple: [position, name, javaAlias, type, mandatory, jbcName, kind]
function fieldValue(language, knowledge, app, fieldName) {
  const field = appEntry(knowledge, app)?.fields.find((f) => f[1] === fieldName);
  if (!field) throw new FieldNotAvailable(`${fieldName} is not a field of ${app} in this release`);
  const [, , alias, , , jbcName, kind] = field;
  if (language === 'infobasic') return [fieldName, null];
  if (language === 'java') {
    if (kind == null)
      throw new FieldNotAvailable(
        `${fieldName} has no single-value getter on the ${app} record class`,
      );
    if (kind !== 'SV')
      throw new FieldNotAvailable(
        `${fieldName} is a multi-value field (${kind}); this Java template needs a single-value field`,
      );
    return [alias.slice(alias.indexOf('_') + 1), null];
  }
  if (!jbcName)
    throw new FieldNotAvailable(`${fieldName} has no componentised (jBC) name in this release`);
  return [jbcName, jbcName.split('.').slice(0, 2).join('.')];
}

export function resolve(template, userInputs, knowledge, today) {
  const values = Object.fromEntries(Object.entries(userInputs).map(([k, v]) => [k, String(v)]));
  values.TODAY = today;
  for (const spec of template.inputs) {
    if (spec.kind !== 'field' || !(spec.id in userInputs)) continue;
    const app = String(userInputs[spec.of]).toUpperCase();
    const equ = String(userInputs[spec.id]).toUpperCase();
    const [value, component] = fieldValue(template.language, knowledge, app, equ);
    values[spec.id] = value;
    const prefix = appEntry(knowledge, app)?.prefix || '';
    values[`${spec.id}_NAME`] = prefix && equ.startsWith(prefix) ? equ.slice(prefix.length) : equ;
    if (component) {
      values[`${spec.of}_COMPONENT`] ??= component;
      values[`${spec.of}_RECORD`] ??= value.slice(component.length + 1).split('.')[0];
    }
  }
  for (const spec of template.inputs) {
    if (spec.kind !== 'app' || !(spec.id in userInputs)) continue;
    const app = String(userInputs[spec.id]).toUpperCase();
    const cls = appEntry(knowledge, app)?.recordClass || recordClass(app);
    values[`${spec.id}_CLASS`] = cls;
    values[`${spec.id}_PACKAGE`] = cls.toLowerCase();
    values.RECORD_CLASS ??= cls;
    values.RECORD_PACKAGE ??= cls.toLowerCase();
  }
  return values;
}

function fill(text, values, missing) {
  return text.replace(PLACEHOLDER, (match, key) => {
    if (!(key in values)) {
      missing.push(key);
      return match;
    }
    return values[key];
  });
}

/** Returns { fileName: content }. Throws MissingInputs rather than emit a {{PLACEHOLDER}}. */
export function render(template, values) {
  const missing = [];
  const out = {};
  for (const [name, content] of Object.entries(template.files))
    out[fill(name, values, missing)] = fill(content, values, missing);
  if (missing.length) throw new MissingInputs(missing);
  return out;
}

/** YYYY-MM-DD of the developer's local calendar day ({{TODAY}} in file headers). */
export function localIsoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
