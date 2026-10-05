// Routine Builder: a copy of the Routine Creator (left unchanged) whose application and field
// inputs are the Artefact Generator's pickers, filled from a loaded knowledge file. Without one it
// behaves exactly like the Routine Creator.

import { useEffect, useMemo, useState } from 'react';
import { KnowledgePanel } from '../../components/KnowledgePanel';
import { knowledgeStore } from '../../lib/knowledge';
import { cp, dl } from '../../lib/text';
import { generatePreset } from '../../services/temenos/routineGenerator';
import { ROUTINE_APPLICATIONS, TABLE_SUFFIXES } from '../../services/temenos/routineCatalog';
import { ROUTINE_SNIPPETS } from '../../services/temenos/routineSnippets';
import { ROUTINE_TEMPLATES } from '../../services/temenos/routineTemplates';
import { AppInput, FieldPicker } from '../artefactGenerator/pickers';
import { CopyWithNewName, ImportReport, OpenRoutineButton } from '../routineCreator/ImportPanel';
import { buildRoutineSpec, createRoutineCreatorState } from '../routineCreator/routineCreatorState';
import { generateRoutine } from './builderGenerator';
import {
  buildBuilderEvalQuery,
  changeTableApplication,
  setTableFields,
  validateBuilderState,
} from './builderState';

const APPLICATIONS = Object.keys(ROUTINE_APPLICATIONS);

/** `options` plus `current` when it is not one of them, so a select never hides its value. */
function withCurrent(options, current) {
  const unique = [...new Set(options.filter(Boolean))];
  return current && !unique.includes(current) ? [current, ...unique] : unique;
}

function updateAt(items, index, patch) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

export function RoutineBuilder() {
  const [state, setState] = useState(createRoutineCreatorState);
  const [showValidation, setShowValidation] = useState(false);
  const [imported, setImported] = useState(null);
  const [mode, setMode] = useState('create');
  const [release, setRelease] = useState('');
  const [knowledge, setKnowledge] = useState(null);
  const copying = Boolean(imported) && mode === 'copy';

  useEffect(() => {
    if (!release) return setKnowledge(null);
    knowledgeStore.get(release).then(setKnowledge);
  }, [release]);

  const spec = useMemo(() => buildRoutineSpec(state), [state]);
  const validation = useMemo(() => validateBuilderState(state, knowledge), [state, knowledge]);
  const output = useMemo(
    () =>
      state.template
        ? generatePreset(state.template, state.routineName)
        : generateRoutine(spec, knowledge),
    [spec, state.routineName, state.template, knowledge],
  );
  const evalQuery = useMemo(() => buildBuilderEvalQuery(state, knowledge), [state, knowledge]);
  // Applications of the loaded release, in table order: one field list each.
  const pickerApps = knowledge
    ? [...new Set(state.tables.map((table) => table.application))].filter(
        (application) => knowledge.apps[application],
      )
    : [];
  // Fields no field list shows (typed before a release was loaded, or opened from a routine).
  const otherFields = state.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !pickerApps.includes(field.table));
  const selectedTemplate = ROUTINE_TEMPLATES.find((template) => template.id === state.template);

  function patch(patchValue) {
    setState((current) => ({ ...current, ...patchValue }));
  }

  function addTable() {
    patch({
      tables: [...state.tables, { application: knowledge ? '' : 'ACCOUNT', suffix: '' }],
    });
  }

  function removeTable(index) {
    // Its fields go with it, unless another table still uses the same application.
    const cleared = changeTableApplication(state, index, '');
    setState({ ...cleared, tables: cleared.tables.filter((_, itemIndex) => itemIndex !== index) });
  }

  function addField() {
    patch({
      fields: [
        ...state.fields,
        {
          name: '',
          table: state.tables[0]?.application || 'ACCOUNT',
          position: '',
        },
      ],
    });
  }

  function removeField(index) {
    patch({ fields: state.fields.filter((_, itemIndex) => itemIndex !== index) });
  }

  function reset() {
    setState(createRoutineCreatorState());
    setShowValidation(false);
    setImported(null);
    setMode('create');
  }

  function openRoutine(routine) {
    setImported({ ...routine, id: (imported?.id || 0) + 1 });
    setState(routine.result.state);
    setMode('create');
    setShowValidation(false);
  }

  const generatedName = (state.routineName || 'MY.ROUTINE').trim() || 'MY.ROUTINE';

  return (
    <section className="routine-creator">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">Temenos · Routine Builder</span>
          <h1>Routine Builder</h1>
          <p>
            The Routine Creator with the applications and fields of your release: load a knowledge
            file, pick any application and tick its fields, and their positions are filled in.
            Without a knowledge file it works like the Routine Creator. Routines never leave your
            browser.
          </p>
        </div>
        <div className="routine-creator-actions">
          <OpenRoutineButton onOpen={openRoutine} />
          {!copying && (
            <>
              <button onClick={() => setShowValidation(true)}>Validate</button>
              <button onClick={reset}>Reset</button>
              <button
                className="primary"
                onClick={() => cp(output, 'Routine copied to clipboard')}
                disabled={!output}
              >
                📋 Copy
              </button>
              <button onClick={() => dl(generatedName + '.b', output)} disabled={!output}>
                ⬇ Download
              </button>
            </>
          )}
        </div>
      </div>

      {imported && (
        <ImportReport
          imported={imported}
          mode={mode}
          setMode={setMode}
          onClose={() => {
            setImported(null);
            setMode('create');
          }}
        />
      )}

      {!copying && showValidation && (
        <div
          className={validation.valid ? 'routine-validation valid' : 'routine-validation invalid'}
          role="status"
        >
          <strong>
            {validation.valid ? '✓ Configuration valid' : 'Configuration needs attention'}
          </strong>
          {validation.errors.map((message) => (
            <div key={message}>{message}</div>
          ))}
          {validation.warnings.map((message) => (
            <div key={message} className="muted">
              {message}
            </div>
          ))}
        </div>
      )}

      {copying ? (
        <CopyWithNewName key={imported.id} imported={imported} />
      ) : (
        <div className="routine-creator-grid">
          <div className="routine-creator-form">
            <section className="routine-card" aria-label="Release">
              <div className="routine-card-title">
                <div>
                  <h2>Release</h2>
                  <small>
                    Applications and field positions come from this release. Without one, the
                    built-in catalog and typed positions are used.
                  </small>
                </div>
              </div>
              <KnowledgePanel release={release} knowledge={knowledge} onRelease={setRelease} />
            </section>

            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Routine identity</h2>
                  <small>Name and developer metadata used by the generated header.</small>
                </div>
              </div>
              <div className="routine-form-grid">
                <label>
                  Routine name
                  <input
                    value={state.routineName}
                    onChange={(event) => patch({ routineName: event.target.value })}
                    placeholder="MY.ROUTINE"
                  />
                </label>
                <label>
                  Developer
                  <input
                    value={state.developer}
                    onChange={(event) => patch({ developer: event.target.value })}
                    placeholder="Developer name"
                  />
                </label>
                <label className="wide">
                  Purpose
                  <input
                    value={state.purpose}
                    onChange={(event) => patch({ purpose: event.target.value })}
                    placeholder="Purpose of the routine"
                  />
                </label>
              </div>
            </section>

            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Application tables</h2>
                  <small>
                    {knowledge
                      ? `Search the ${knowledge.release} applications; optional $HIS / $NAU suffix.`
                      : 'Select application files and optional $HIS / $NAU suffixes.'}
                  </small>
                </div>
                <button onClick={addTable}>+ Table</button>
              </div>
              <div className="routine-list">
                {state.tables.map((table, index) => (
                  <div className="routine-row" key={index}>
                    {knowledge ? (
                      <AppInput
                        spec={{ id: 'table-' + index, label: 'Application table ' + (index + 1) }}
                        value={table.application}
                        knowledge={knowledge}
                        onChange={(application) =>
                          setState(changeTableApplication(state, index, application))
                        }
                      />
                    ) : (
                      <select
                        aria-label={'Application table ' + (index + 1)}
                        value={table.application}
                        onChange={(event) =>
                          setState(changeTableApplication(state, index, event.target.value))
                        }
                      >
                        {withCurrent(APPLICATIONS, table.application).map((application) => (
                          <option key={application} value={application}>
                            {application}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      aria-label={'Table suffix ' + (index + 1)}
                      value={table.suffix}
                      onChange={(event) =>
                        patch({
                          tables: updateAt(state.tables, index, { suffix: event.target.value }),
                        })
                      }
                    >
                      {TABLE_SUFFIXES.map((suffix) => (
                        <option key={suffix || 'base'} value={suffix}>
                          {suffix || 'Base'}
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label={'Remove table ' + (index + 1)}
                      onClick={() => removeTable(index)}
                      disabled={state.tables.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Fields</h2>
                  <small>
                    {knowledge
                      ? `Tick the fields of each application; positions come from ${knowledge.release}.`
                      : 'Positions are optional. Unverified fields are kept as comments instead of invalid BASIC expressions.'}
                  </small>
                </div>
                {!knowledge && <button onClick={addField}>+ Field</button>}
              </div>
              {pickerApps.map((application) => (
                <div key={application} className="artefact-field">
                  <span>{application}</span>
                  <FieldPicker
                    spec={{ id: 'fields-' + application, label: application + ' fields' }}
                    app={application}
                    value={state.fields
                      .filter((field) => field.table === application)
                      .map((field) => field.name)}
                    knowledge={knowledge}
                    language="infobasic"
                    multiple
                    onChange={(names) =>
                      patch({ fields: setTableFields(state.fields, application, names, knowledge) })
                    }
                  />
                </div>
              ))}
              {knowledge && !pickerApps.length && (
                <p className="muted">Choose an application of {knowledge.release} first.</p>
              )}
              {!knowledge && state.fields.length === 0 ? (
                <p className="muted">
                  No fields selected. Add fields when the record layout is known.
                </p>
              ) : otherFields.length === 0 ? null : (
                <div className="routine-list">
                  {otherFields.map(({ field, index }) => (
                    <div className="routine-row routine-field-row" key={index}>
                      <input
                        aria-label={'Field name ' + (index + 1)}
                        value={field.name}
                        onChange={(event) =>
                          patch({
                            fields: updateAt(state.fields, index, { name: event.target.value }),
                          })
                        }
                        placeholder="AC.CUSTOMER"
                      />
                      <select
                        aria-label={'Field table ' + (index + 1)}
                        value={field.table}
                        onChange={(event) =>
                          patch({
                            fields: updateAt(state.fields, index, { table: event.target.value }),
                          })
                        }
                      >
                        {withCurrent(
                          knowledge ? state.tables.map((table) => table.application) : APPLICATIONS,
                          field.table,
                        ).map((application) => (
                          <option key={application} value={application}>
                            {application}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={'Field position ' + (index + 1)}
                        type="number"
                        min="1"
                        value={field.position}
                        onChange={(event) =>
                          patch({
                            fields: updateAt(state.fields, index, { position: event.target.value }),
                          })
                        }
                        placeholder="Position"
                      />
                      <button
                        aria-label={'Remove field ' + (index + 1)}
                        onClick={() => removeField(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Functions and snippets</h2>
                  <small>
                    Selected snippets are inserted into PROCESS. F.READ/F.WRITE use the selected
                    application context.
                  </small>
                </div>
              </div>
              <div className="routine-snippet-grid">
                {ROUTINE_SNIPPETS.map((snippet) => (
                  <label className="routine-check" key={snippet.id} title={snippet.description}>
                    <input
                      type="checkbox"
                      checked={state.functions.includes(snippet.id)}
                      onChange={(event) =>
                        patch({
                          functions: event.target.checked
                            ? [...state.functions, snippet.id]
                            : state.functions.filter((id) => id !== snippet.id),
                        })
                      }
                    />
                    <span>
                      <b>{snippet.name}</b>
                      <small>{snippet.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Generation options</h2>
                  <small>These options map directly to the Phase 1 generator contract.</small>
                </div>
              </div>
              <div className="routine-option-grid">
                <label className="routine-check compact">
                  <input
                    type="checkbox"
                    checked={state.concat}
                    onChange={(event) => patch({ concat: event.target.checked })}
                  />
                  <span>
                    <b>Concatenate selected fields</b>
                    <small>Build MY.DATA from verified field values.</small>
                  </span>
                </label>
                <label className="routine-check compact">
                  <input
                    type="checkbox"
                    checked={state.clearFields}
                    onChange={(event) => patch({ clearFields: event.target.checked })}
                  />
                  <span>
                    <b>Clear selected fields</b>
                    <small>Opt-in field clearing after extraction.</small>
                  </span>
                </label>
                <label>
                  Separator
                  <input
                    value={state.separator}
                    maxLength="8"
                    onChange={(event) => patch({ separator: event.target.value })}
                    disabled={!state.concat}
                  />
                </label>
              </div>
            </section>

            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Legacy template</h2>
                  <small>
                    Recovered templates are reference presets and do not change the generator
                    contract.
                  </small>
                </div>
              </div>
              <div className="routine-template-picker">
                <select
                  value={state.template}
                  onChange={(event) => patch({ template: event.target.value })}
                >
                  <option value="">Generated routine</option>
                  {ROUTINE_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate && <p className="muted">{selectedTemplate.description}</p>}
              </div>
            </section>

            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>EVAL query helper</h2>
                  <small>
                    Build an application-aware SELECT ... SAVING EVAL statement from selected
                    fields.
                  </small>
                </div>
              </div>
              <label className="routine-check compact">
                <input
                  type="checkbox"
                  checked={state.evalQuery}
                  onChange={(event) => patch({ evalQuery: event.target.checked })}
                />
                <span>
                  <b>Generate EVAL query</b>
                  <small>
                    Uses the first selected application table and strips only its own field prefix.
                  </small>
                </span>
              </label>
              {state.evalQuery && (
                <input
                  className="routine-eval-separator"
                  aria-label="EVAL separator"
                  value={state.evalSeparator}
                  maxLength="8"
                  onChange={(event) => patch({ evalSeparator: event.target.value })}
                  placeholder="^"
                />
              )}
              {evalQuery && <pre className="routine-query">{evalQuery}</pre>}
            </section>
          </div>

          <aside className="routine-preview-card">
            <div className="routine-preview-head">
              <div>
                <span className="eyebrow">Live output</span>
                <h2>{generatedName}.b</h2>
              </div>
              <span className={validation.valid ? 'routine-status ok' : 'routine-status warn'}>
                {validation.valid ? 'Ready' : 'Needs attention'}
              </span>
            </div>
            <textarea className="routine-output" value={output} readOnly spellCheck={false} />
            <div className="routine-preview-foot">
              <span>
                {state.template
                  ? 'Legacy preset'
                  : knowledge
                    ? 'Fields from ' + knowledge.release
                    : 'Built-in catalog'}{' '}
                · {output.split('\n').length} lines
              </span>
              {validation.warnings.length > 0 && (
                <span>{validation.warnings.length} warning(s)</span>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

export default RoutineBuilder;
