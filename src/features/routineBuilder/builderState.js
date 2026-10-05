// Routine Builder state: the Routine Creator's state (routineCreatorState.js, reused unchanged)
// plus what a loaded knowledge file adds -- any application of the release, and fields picked
// from its field list with their positions.

import { getApplication } from '../../services/temenos/routineCatalog';
import { validateRoutineState } from '../routineCreator/routineCreatorState';
import { generateEvalQuery } from './builderGenerator';

/** Replace the fields of `application` with `names` (in that order), positions from the release. */
export function setTableFields(fields, application, names, knowledge) {
  const positions = new Map(
    (knowledge?.apps?.[application]?.fields || []).map(([position, name]) => [name, position]),
  );
  return [
    ...fields.filter((field) => field.table !== application),
    ...names.map((name) => ({
      name,
      table: application,
      position: positions.has(name) ? String(positions.get(name)) : '',
    })),
  ];
}

/** Set a table's application; fields of the old one go unless another table still uses it. */
export function changeTableApplication(state, index, application) {
  const old = state.tables[index]?.application;
  const tables = state.tables.map((table, i) => (i === index ? { ...table, application } : table));
  const stillUsed = tables.some((table) => table.application === old);
  return {
    ...state,
    tables,
    fields: stillUsed ? state.fields : state.fields.filter((field) => field.table !== old),
  };
}

export function validateBuilderState(state, knowledge = null) {
  const result = validateRoutineState(state);
  const errors = [...result.errors];
  if (!state.template) {
    for (const { application } of state.tables) {
      const name = String(application || '').trim();
      if (!name) errors.push('Choose an application for every table.');
      else if (knowledge && !knowledge.apps?.[name])
        errors.push(`${name} is not an application in ${knowledge.release}.`);
      else if (!knowledge && !getApplication(name))
        errors.push(`${name} is not in the built-in catalog. Load a knowledge file to use it.`);
    }
  }
  const unique = [...new Set(errors)];
  return { valid: unique.length === 0, errors: unique, warnings: result.warnings };
}

export function buildBuilderEvalQuery(state, knowledge = null) {
  if (!state.evalQuery || !state.tables.length) return '';
  const table = state.tables[0].application + state.tables[0].suffix;
  const fields = state.fields.map((field) => field.name).filter(Boolean);
  return generateEvalQuery(table, fields, state.evalSeparator, knowledge);
}
