// Copy of the Routine Creator's generator (src/services/temenos/routineGenerator.js) for the
// Routine Builder. The only difference: an application is looked up in the 16-entry catalog first
// (keeping its aliases, so catalog output is identical) and otherwise in the loaded knowledge file,
// which gives every application of the release derived names (FN.<APP>, F.<APP>, R.<APP>, ...).
// builderGenerator.test.js checks the catalog output against the original byte for byte.

import {
  getApplication,
  ROUTINE_APPLICATIONS,
  TABLE_SUFFIXES,
} from '../../services/temenos/routineCatalog';
import { getRoutineSnippet } from '../../services/temenos/routineSnippets';

const valueOf = (value) => String(value ?? '').trim();

const derived = new Map(); // `${release}|${name}` -> frozen application, so lookups stay cheap

/** Catalog application, else one derived from the knowledge file, else null. */
export function resolveApplication(name, knowledge) {
  if (typeof name !== 'string') return null;
  const catalog = getApplication(name);
  if (catalog) return catalog;
  const entry = knowledge?.apps?.[name];
  if (!entry) return null;
  const key = knowledge.release + '|' + name;
  if (!derived.has(key))
    derived.set(
      key,
      Object.freeze({
        name,
        alias: name,
        fileAlias: name,
        fieldPrefix: entry.prefix || '',
        recordVar: 'R.' + name,
        hasLayoutInsert: true,
        fileNameVariable: 'FN.' + name,
        fileVariable: 'F.' + name,
        errorVariable: 'E.' + name,
        idVariable: 'Y.' + name + '.ID',
      }),
    );
  return derived.get(key);
}

/** Same as routineCatalog.normalizeTableSpec, with knowledge-file applications. */
function normalizeTableSpec(table, knowledge) {
  if (typeof table === 'string') {
    const value = table.trim();
    const suffix = value.endsWith('$HIS') ? '$HIS' : value.endsWith('$NAU') ? '$NAU' : '';
    const name = suffix ? value.slice(0, -suffix.length) : value;
    const application = resolveApplication(name, knowledge);
    return application ? { application, suffix, table: name + suffix } : null;
  }

  if (!table || typeof table !== 'object') return null;

  const name = String(table.name || table.application || '').trim();
  const suffix = String(table.suffix || '');
  const application = resolveApplication(name, knowledge);

  return application && TABLE_SUFFIXES.includes(suffix)
    ? { application, suffix, table: name + suffix }
    : null;
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const keyValue = key(item);
    if (seen.has(keyValue)) return false;
    seen.add(keyValue);
    return true;
  });
}

function normalizeTables(tables, knowledge) {
  return uniqueBy(
    (Array.isArray(tables) ? tables : [tables])
      .map((table) => normalizeTableSpec(table, knowledge))
      .filter(Boolean),
    (item) => item.table,
  );
}

function inferApplication(fieldName, tables) {
  const name = valueOf(fieldName);
  const matches = tables
    .filter(
      ({ application }) => application.fieldPrefix && name.startsWith(application.fieldPrefix),
    )
    .sort(
      (left, right) => right.application.fieldPrefix.length - left.application.fieldPrefix.length,
    );

  return matches[0]?.application || null;
}

function normalizeFields(fields, tables, knowledge) {
  return uniqueBy(
    (Array.isArray(fields) ? fields : [fields])
      .map((field) => {
        if (typeof field === 'string') {
          const inferred = inferApplication(field, tables) || tables[0]?.application;
          return {
            name: valueOf(field),
            table: inferred?.name || '',
            position: null,
            verified: false,
          };
        }

        if (!field) return null;

        const name = valueOf(field.name || field.field || field.alias);
        const tableName = valueOf(field.table || field.application);
        const inferred =
          resolveApplication(tableName, knowledge) ||
          inferApplication(name, tables) ||
          tables[0]?.application;
        const numericPosition =
          field.position === undefined || field.position === null || field.position === ''
            ? null
            : Number(field.position);
        const position =
          Number.isInteger(numericPosition) && numericPosition > 0 ? numericPosition : null;

        return {
          name,
          table: inferred?.name || tableName,
          position,
          verified: position !== null,
        };
      })
      .filter((field) => field?.name),
    (field) => field.table + '|' + field.name + '|' + (field.position ?? ''),
  );
}

function fieldExpression(field) {
  return field.verified && Number.isInteger(field.position) && field.position > 0
    ? '<' + field.position + '>'
    : null;
}

function fieldVariable(field) {
  return 'Y.' + field.name;
}

function headerLines(spec) {
  const routineName = valueOf(spec.routineName) || 'UNNAMED.ROUTINE';
  const lines = [
    '*-----------------------------------------------------------------------------',
    '*  Developed By          : ' + valueOf(spec.developer),
    '*  Purpose               : ' + valueOf(spec.purpose),
    '*-----------------------------------------------------------------------------',
    '',
    '    SUBROUTINE ' + routineName.toUpperCase(),
    '',
    '    $INSERT I_COMMON',
    '    $INSERT I_EQUATE',
  ];

  if (spec.header) {
    lines.push(...String(spec.header).replace(/\r\n?/g, '\n').split('\n'));
  }

  return lines;
}

function layoutLines(tables) {
  const seen = new Set();
  const lines = [];

  for (const { application } of tables) {
    if (!application.hasLayoutInsert || seen.has(application.name)) continue;
    seen.add(application.name);
    lines.push('    $INSERT I_F.' + application.name);
  }

  return lines;
}

function initLines(tables) {
  if (!tables.length) return ['    * No application tables selected'];

  return tables.flatMap(({ application, suffix }) => [
    '    ' + application.fileNameVariable + ' = "F.' + application.name + suffix + '"',
    '    ' + application.fileVariable + ' = ""',
    '    CALL OPF(' + application.fileNameVariable + ',' + application.fileVariable + ')',
  ]);
}

function contextualFread(application) {
  return (
    '    CALL F.READ(' +
    application.fileNameVariable +
    ',' +
    application.idVariable +
    ',' +
    application.recordVar +
    ',' +
    application.fileVariable +
    ',' +
    application.errorVariable +
    ')'
  );
}

function contextualFwrite(application) {
  return [
    '    CALL F.WRITE(' +
      application.fileNameVariable +
      ',' +
      application.idVariable +
      ',' +
      application.recordVar +
      ')',
    '    CALL JOURNAL.UPDATE(' + application.idVariable + ')',
  ];
}

function functionLines(functions, tables) {
  return (Array.isArray(functions) ? functions : []).flatMap((id) => {
    if (id === 'Fread') {
      return tables.length
        ? tables.map(({ application }) => contextualFread(application))
        : [getRoutineSnippet('Fread').content];
    }

    if (id === 'Fwrite') {
      return tables.length
        ? tables.flatMap(({ application }) => contextualFwrite(application))
        : [getRoutineSnippet('Fwrite').content];
    }

    const snippet = typeof id === 'string' ? getRoutineSnippet(id) : null;
    return snippet ? snippet.content.split('\n').map((line) => '    ' + line) : [];
  });
}

function fieldLines(fields, tables, knowledge) {
  if (!fields.length) return ['    * No fields selected'];

  return fields.flatMap((field) => {
    const application =
      resolveApplication(field.table, knowledge) ||
      inferApplication(field.name, tables) ||
      tables[0]?.application;
    const expression = fieldExpression(field);

    if (!expression) {
      return [
        '    * Field position not verified: ' +
          field.name +
          '. Verify the application schema before generating field access.',
      ];
    }

    return [
      '    ' + fieldVariable(field) + ' = ' + (application?.recordVar || 'R.FILE') + expression,
    ];
  });
}

function generatedFields(fields) {
  return fields.filter((field) => fieldExpression(field));
}

function concatLines(fields, enabled, separator) {
  const selected = generatedFields(fields);
  if (!enabled || !selected.length) return [];

  const sep = String(separator ?? '');
  return [
    '    MY.DATA<-1> = ' +
      selected.map(fieldVariable).join(" : '" + sep.replaceAll("'", "''") + "' : "),
  ];
}

function clearLines(fields, enabled) {
  if (!enabled) return [];
  return generatedFields(fields).map((field) => '    ' + fieldVariable(field) + " = ''");
}

export function generateRoutine(spec = {}, knowledge = null) {
  const tables = normalizeTables(spec.tables || [], knowledge);
  const fields = normalizeFields(spec.fields || [], tables, knowledge);

  return [
    ...headerLines(spec),
    '',
    ...layoutLines(tables),
    '* $INSERT I_ENQUIRY.COMMON',
    '',
    '    GOSUB INIT',
    '    GOSUB PROCESS',
    '',
    '    RETURN',
    '',
    '********',
    'INIT:',
    '********',
    '',
    ...initLines(tables),
    '',
    '    RETURN',
    '',
    '***************',
    'PROCESS:',
    '***************',
    '',
    ...functionLines(spec.functions, tables),
    ...fieldLines(fields, tables, knowledge),
    ...concatLines(fields, Boolean(spec.concat), spec.separator ?? '^'),
    ...clearLines(fields, Boolean(spec.clearFields)),
    '',
    '    RETURN',
    '',
    'END',
  ].join('\n');
}

function stripExactPrefix(field, application) {
  const name = valueOf(field);
  const matchingApplication = Object.values(ROUTINE_APPLICATIONS)
    .filter(({ fieldPrefix }) => fieldPrefix && name.startsWith(fieldPrefix))
    .sort((left, right) => right.fieldPrefix.length - left.fieldPrefix.length)[0];

  if (matchingApplication && matchingApplication.name !== application.name) return name;

  const prefixes = [
    application.fieldPrefix,
    application.alias ? application.alias + '.' : '',
    application.name + '.',
  ].filter(Boolean);

  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }

  return name;
}

export function generateEvalQuery(table, fields = [], separator = '^', knowledge = null) {
  const normalized = normalizeTableSpec(table, knowledge);
  if (!normalized) return '';

  const values = (Array.isArray(fields) ? fields : [fields])
    .map((field) => (typeof field === 'object' ? field.name || field.field : field))
    .map((field) => stripExactPrefix(field, normalized.application))
    .map(valueOf)
    .filter(Boolean);

  if (!values.length) return 'SELECT FBNK.' + normalized.table + ' SAVING EVAL ""';

  const sep = String(separator ?? '');
  const expression = values
    .map((value) => '"' + value.replaceAll('"', '""') + '"')
    .join(':"' + sep.replaceAll('"', '""') + '":');

  return 'SELECT FBNK.' + normalized.table + ' SAVING EVAL ' + expression;
}
