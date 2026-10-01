import { ROUTINE_APPLICATIONS, TABLE_SUFFIXES } from '../../services/temenos/routineCatalog';
import { createRoutineCreatorState } from './routineCreatorState';

// "Open existing routine": reads a T24 BASIC routine back into the Routine Creator's state, as far
// as that model can represent it. The generator's rule applies here too: nothing is invented. A
// field keeps a position only when the source states one, an application must be in the catalog,
// and everything the model cannot hold is listed in `unmapped`.

const HEADER = /^\s*(SUBROUTINE|PROGRAM|FUNCTION)\s+([A-Za-z][\w.$%]*)/i;
const CREATOR_NAME = /^[A-Za-z][A-Za-z0-9_.]*$/;
const DEVELOPER = /^\s*\*+\s*(?:Developed\s+By|Developer|Author)\s*:\s*(.*?)[\s*]*$/i;
const PURPOSE = /^\s*\*+\s*(?:Purpose|Description)\s*:\s*(.*?)[\s*]*$/i;
const LAYOUT_INSERT = /^\$(?:INSERT|INCLUDE)\s+(?:\S+\s+)?I_F\.([A-Za-z0-9.]+)\s*$/i;
const FILE_LITERAL = /(["'])F\.([A-Za-z0-9.]+?)(\$HIS|\$NAU)?\1/g;
const FILE_ASSIGNMENT = /^([A-Za-z][\w.]*)\s*=\s*(["'])F\.([A-Za-z0-9.]+?)(\$HIS|\$NAU)?\2/;
const FREAD = /\bCALL\s+F\.READ\s*\(\s*([\w.]+)\s*,\s*[^,]+,\s*([\w.]+)\s*,/i;
const CALL = /\bCALL\s+([A-Za-z][\w.$%]*)/gi;
const LABEL = /^([A-Za-z][\w.$]*):(?=\s|\*|$)/;
const R_NEW = /\bR\.(?:NEW|OLD)\(\s*([^()]+?)\s*\)/gi;

// Calls the creator itself generates around the snippets it maps.
const GENERATED_CALLS = new Set(['F.READ', 'F.WRITE', 'OPF', 'JOURNAL.UPDATE']);
// Paragraphs the generated routine has.
const GENERATED_LABELS = new Set(['INIT', 'PROCESS']);

export const MAX_ROUTINE_BYTES = 1_048_576;

/** Why an opened file cannot be read as a routine, or null when it can. */
export function routineFileError(text, size) {
  if (size > MAX_ROUTINE_BYTES) {
    return 'This file is larger than 1 MB; T24 routines are text files far below that size.';
  }
  if (String(text).includes('\u0000')) {
    return 'This file is not a text routine (it contains binary data).';
  }
  return null;
}

const isComment = (line) => /^\s*(?:\*|!|\/\/|REM\b)/i.test(line);
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fileBaseName(fileName) {
  const base = String(fileName || '')
    .split(/[\\/]/)
    .pop();
  return base.replace(/\.(b|txt)$/i, '');
}

/**
 * Parses routine source into Routine Creator state.
 * @returns {{ name: string, kind: string|null, state: object, mapped: string[],
 *   unmapped: string[], calls: string[] }}
 */
export function parseRoutine(source, fileName = '') {
  const lines = String(source ?? '').split(/\r\n|\r|\n/);
  const code = lines.filter((line) => line.trim() && !isComment(line));
  const comments = lines.filter(isComment);
  const state = createRoutineCreatorState();
  const mapped = [];
  const unmapped = [];
  const note = (message) => unmapped.includes(message) || unmapped.push(message);

  // Name and kind.
  const header = code.map((line) => line.match(HEADER)).find(Boolean);
  const kind = header ? header[1].toUpperCase() : null;
  const name = header ? header[2] : fileBaseName(fileName);
  if (!header) {
    note(
      name
        ? 'No SUBROUTINE, PROGRAM or FUNCTION header found; the name was taken from the file name.'
        : 'No SUBROUTINE, PROGRAM or FUNCTION header found.',
    );
  }
  if (kind && kind !== 'SUBROUTINE') {
    note(kind + ' header: the Routine Creator generates a SUBROUTINE.');
  }
  state.routineName = name;
  if (name) {
    mapped.push('Routine name ' + name);
    if (!CREATOR_NAME.test(name)) {
      note('Routine name ' + name + ' contains characters the creator does not accept.');
    }
  }

  // Header comments.
  const firstValue = (pattern) =>
    comments.map((line) => line.match(pattern)?.[1]?.trim()).find(Boolean) || '';
  state.developer = firstValue(DEVELOPER);
  state.purpose = firstValue(PURPOSE);
  if (state.developer) mapped.push('Developer ' + state.developer);
  if (state.purpose) mapped.push('Purpose ' + state.purpose);

  // Application tables: files opened as "F.<APP>[$HIS|$NAU]", then layouts ($INSERT I_F.<APP>)
  // of applications the routine does not open.
  const tables = [];
  const fileVariables = new Map();
  const addTable = (application, suffix) => {
    if (!ROUTINE_APPLICATIONS[application] || !TABLE_SUFFIXES.includes(suffix)) {
      note('Application ' + application + ' is not in the Routine Creator catalog.');
      return;
    }
    if (!tables.some((t) => t.application === application && t.suffix === suffix)) {
      tables.push({ application, suffix });
    }
  };
  for (const line of code) {
    const assignment = line.trim().match(FILE_ASSIGNMENT);
    if (assignment) fileVariables.set(assignment[1], assignment[3].toUpperCase());
    for (const [, , application, suffix = ''] of line.matchAll(FILE_LITERAL)) {
      addTable(application.toUpperCase(), suffix);
    }
  }
  for (const line of code) {
    const insert = line.trim().match(LAYOUT_INSERT);
    if (!insert) continue;
    const application = insert[1].toUpperCase();
    if (!tables.some((t) => t.application === application)) addTable(application, '');
  }
  state.tables = tables;
  for (const { application, suffix } of tables) mapped.push('Table ' + application + suffix);
  if (!tables.length) note('No application table from the catalog was found.');

  // F.READ / F.WRITE.
  const uses = (pattern) => code.some((line) => pattern.test(line));
  if (uses(/\bCALL\s+F\.READ\b(?!\.)/i)) {
    state.functions.push('Fread');
    mapped.push('F.READ');
  }
  if (uses(/\bCALL\s+F\.WRITE\b(?!\.)/i)) {
    state.functions.push('Fwrite');
    mapped.push('F.WRITE');
  }

  // Fields: record variables are tied to an application through the F.READ that fills them.
  const records = new Map();
  for (const line of code) {
    const read = line.match(FREAD);
    const application = read && fileVariables.get(read[1]);
    if (application && ROUTINE_APPLICATIONS[application]) records.set(read[2], application);
  }
  const fields = [];
  const addField = (fieldName, table, position) => {
    if (fields.some((f) => f.name === fieldName && f.table === table)) return;
    fields.push({ name: fieldName, table, position });
    mapped.push(
      'Field ' +
        fieldName +
        ' (' +
        table +
        ', ' +
        (position ? 'position ' + position : 'position not stated') +
        ')',
    );
  };
  for (const line of code) {
    for (const [record, table] of records) {
      const access = new RegExp('(?<![\\w.])' + escapeRegExp(record) + '<([^<>]+)>', 'g');
      for (const match of line.matchAll(access)) {
        const inside = match[1].trim();
        if (/^\d+$/.test(inside)) {
          const target = line.slice(0, match.index).match(/^\s*([A-Za-z][\w.]*)\s*=\s*$/);
          if (target) addField(target[1].replace(/^Y\./, ''), table, inside);
          else
            note(
              record + '<' + inside + '> has a position but no field name, so it is not mapped.',
            );
        } else if (/^[A-Za-z][\w.]*$/.test(inside) && !/^Y\./.test(inside)) {
          addField(inside, table, '');
        } else if (inside !== '-1') {
          note(record + '<' + inside + '> is not mapped (only single field positions are).');
        }
      }
    }
  }
  state.fields = fields;

  const runtimeFields = [
    ...new Set(code.flatMap((line) => [...line.matchAll(R_NEW)].map((m) => m[1]))),
  ];
  if (runtimeFields.length) {
    note(
      'R.NEW / R.OLD field access (' +
        runtimeFields.join(', ') +
        ') is not mapped: the application is not stated in the source.',
    );
  }

  // Everything else the generated routine does not have.
  const calls = [];
  for (const line of code) {
    for (const [, called] of line.matchAll(CALL)) {
      const upper = called.toUpperCase();
      if (!GENERATED_CALLS.has(upper) && !calls.includes(called)) calls.push(called);
    }
  }
  for (const called of calls) note('CALL ' + called + ' is not represented by the creator.');
  for (const line of code) {
    const label = line.match(LABEL)?.[1];
    if (label && !GENERATED_LABELS.has(label.toUpperCase())) {
      note('Paragraph ' + label + ' is not represented by the creator.');
    }
  }

  return { name, kind, state, mapped, unmapped, calls };
}
