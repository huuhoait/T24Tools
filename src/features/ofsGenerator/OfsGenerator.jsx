import { useEffect, useMemo, useState } from 'react';
import { cp } from '../../lib/text';
import { toast } from '../../lib/toast';
import {
  FUNCTIONS,
  OFS_CONFIG_KEY,
  OFS_HANDOFF_KEY,
  PROCESSING_FLAGS,
  REQUEST_TYPES,
  configFromState,
  emptyValue,
  fieldPreview,
  generateData,
  generateMessage,
  initialOfsState,
  newField,
  optionSegment,
  parseData,
  parseMessage,
  stateFromConfig,
  stateFromHandoff,
} from './ofsMessage';

const SEGMENTS = [
  ['Operation', 'Application, ENQUIRY.SELECT, XML.REPORT…'],
  ['Options', 'Version / function / processing'],
  ['User', 'User / password / company'],
  ['ID', 'Record or enquiry context'],
  ['Data', 'FIELD:MV:SV=VALUE'],
];

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJson(key) {
  try {
    return JSON.parse(readStorage(key) || 'null');
  } catch {
    return null;
  }
}

// A Log Analyzer handoff is read when the tool opens and removed once it has been used.
function initialState() {
  return stateFromHandoff(readJson(OFS_HANDOFF_KEY)) || initialOfsState();
}

const updateAt = (list, index, patch) =>
  list.map((item, i) => (i === index ? { ...item, ...patch } : item));

/** A select that still shows a parsed value it has no option for (e.g. function `S`). */
function OptionSelect({ label, value, options, onChange }) {
  const known = options.some(([v]) => v === value);
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!known && <option value={value}>{value}</option>}
        {options.map(([v, text]) => (
          <option key={v || 'blank'} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, className, ...rest }) {
  return (
    <label className={className}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

function DataElement({ field, index, onChange, onRemove }) {
  const n = index + 1;
  const setValue = (vi, patch) => onChange({ values: updateAt(field.values, vi, patch) });
  return (
    <div className="ofs-element">
      <div className="ofs-element-head">
        <input
          aria-label={'Field name ' + n}
          className="ofs-element-name"
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="FIELD.NAME"
          spellCheck={false}
        />
        <button type="button" onClick={() => onChange({ values: [...field.values, emptyValue()] })}>
          + Value
        </button>
        <button type="button" aria-label={'Remove field ' + n} onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="ofs-values">
        {field.values.map((v, vi) => (
          <div className="ofs-value-row" key={vi}>
            <input
              aria-label={`Field ${n} value ${vi + 1} multi-value`}
              value={v.mv}
              onChange={(e) => setValue(vi, { mv: e.target.value.trim() })}
              placeholder="MV"
              inputMode="numeric"
            />
            <input
              aria-label={`Field ${n} value ${vi + 1} sub-value`}
              value={v.sv}
              onChange={(e) => setValue(vi, { sv: e.target.value.trim() })}
              placeholder="SV"
              inputMode="numeric"
            />
            <input
              aria-label={`Field ${n} value ${vi + 1}`}
              value={v.value}
              onChange={(e) => setValue(vi, { value: e.target.value })}
              placeholder="Value"
            />
            <button
              type="button"
              aria-label={`Remove field ${n} value ${vi + 1}`}
              onClick={() =>
                onChange({
                  values:
                    field.values.length > 1
                      ? field.values.filter((_, i) => i !== vi)
                      : [emptyValue()],
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <code className="ofs-element-preview">{fieldPreview(field)}</code>
    </div>
  );
}

function GenericRequest({ state, patch }) {
  const data = (label, placeholder, rows = 4) => (
    <label className="wide">
      {label}
      <textarea
        rows={rows}
        value={state.genericData}
        onChange={(e) => patch({ genericData: e.target.value })}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  );
  const id = (label, placeholder = 'Optional') => (
    <TextField
      label={label}
      value={state.genericId}
      onChange={(genericId) => patch({ genericId })}
      placeholder={placeholder}
    />
  );
  const copy = {
    Enquiry: ['Enquiry request', 'ENQUIRY.SELECT carries the enquiry name and its selection.'],
    XMLReport: ['XML report request', 'XML.REPORT takes ID or XML as its option.'],
    Clearing: ['Clearing request', 'Clearing data syntax depends on your configuration.'],
    TEC: ['TEC request', 'Specialist TEC operation; the data part is sent as entered.'],
  }[state.type];
  return (
    <section className="routine-card">
      <div className="routine-card-title">
        <div>
          <h2>{copy[0]}</h2>
          <small>{copy[1]}</small>
        </div>
      </div>
      <div className="routine-form-grid">
        {state.type === 'Enquiry' && (
          <>
            <TextField
              label="Enquiry name"
              value={state.enquiryName}
              onChange={(enquiryName) => patch({ enquiryName })}
              placeholder="ENQUIRY.SELECT"
            />
            {id('ID / selection context')}
            {data('Selection criteria', 'Selection criteria or enquiry data')}
          </>
        )}
        {state.type === 'XMLReport' && (
          <>
            <OptionSelect
              label="Option"
              value={state.xmlOption}
              options={[
                ['ID', 'ID'],
                ['XML', 'XML'],
              ]}
              onChange={(xmlOption) => patch({ xmlOption })}
            />
            {id('Report ID / name', 'Report key or report name')}
            {data('Data', '', 3)}
          </>
        )}
        {state.type === 'Clearing' && (
          <>
            {id('Clearing ID / context')}
            {data(
              'Clearing data',
              'Enter the clearing data exactly as your configuration needs',
              5,
            )}
          </>
        )}
        {state.type === 'TEC' && data('Data', 'TEC data, e.g. FLUSH', 3)}
      </div>
    </section>
  );
}

export function OfsGenerator() {
  const [state, setState] = useState(initialState);
  const [rawData, setRawData] = useState('');
  const [fullMessage, setFullMessage] = useState('');
  const [parsed, setParsed] = useState(null); // { type, parts } of the last parsed message
  const patch = (p) => setState((s) => ({ ...s, ...p }));

  useEffect(() => {
    if (readStorage(OFS_HANDOFF_KEY) === null) return;
    try {
      localStorage.removeItem(OFS_HANDOFF_KEY);
    } catch {}
    toast.success('Loaded the OFS message from the T24 Log Analyzer. Add your user and password.');
  }, []);

  const { message, error } = useMemo(() => generateMessage(state), [state]);
  const data = useMemo(() => generateData(state.fields), [state.fields]);
  const options = optionSegment(state);
  const isTransaction = state.type === 'Transaction';

  function save() {
    try {
      localStorage.setItem(OFS_CONFIG_KEY, JSON.stringify(configFromState(state)));
      toast.success('Configuration saved in this browser (without the password)');
    } catch {
      toast.error('Could not save: browser storage is blocked');
    }
  }

  function load() {
    const next = stateFromConfig(readJson(OFS_CONFIG_KEY), state);
    if (!next) return toast.info('No saved configuration found');
    setState(next);
    toast.success('Configuration loaded');
  }

  function clear() {
    setState(initialOfsState());
    setRawData('');
    setFullMessage('');
    setParsed(null);
  }

  function parseRawData() {
    if (!rawData.trim()) return toast.info('Paste message data first');
    const fields = parseData(rawData);
    patch({ fields });
    toast.success(`Parsed ${fields.reduce((n, f) => n + f.values.length, 0)} value(s)`);
  }

  function parseFull() {
    if (!fullMessage.trim()) return toast.info('Paste a complete OFS message first');
    const result = parseMessage(fullMessage);
    patch(result.patch);
    setParsed(result);
    toast.success(`Parsed a ${result.type} message into the form`);
  }

  return (
    <div className="routine-creator ofs-generator">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">OFS Message Generator</span>
          <h1>Build, parse and inspect OFS messages</h1>
          <p>
            Fill the five parts of a Temenos OFS message and copy it, or paste one to take it apart.
            Saved settings stay in this browser and never include the password.
          </p>
        </div>
        <div className="routine-creator-actions">
          <button type="button" className="primary" onClick={() => cp(message, 'OFS copied')}>
            Copy OFS
          </button>
          <button type="button" onClick={save}>
            Save
          </button>
          <button type="button" onClick={load}>
            Load saved
          </button>
          <button type="button" onClick={clear}>
            Clear
          </button>
        </div>
      </div>

      <ol className="ofs-segments" aria-label="OFS message structure">
        {SEGMENTS.map(([name, note], i) => (
          <li key={name}>
            <b>
              {i + 1}. {name}
            </b>
            <small>{note}</small>
          </li>
        ))}
      </ol>

      <div className="routine-creator-grid">
        <div className="routine-creator-form">
          <div className="tabs ofs-types" role="tablist" aria-label="Request type">
            {REQUEST_TYPES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={state.type === id}
                className={state.type === id ? 'active' : undefined}
                onClick={() => patch({ type: id })}
              >
                {label}
              </button>
            ))}
          </div>

          {isTransaction && (
            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Operation and options</h2>
                  <small>
                    Blank positions in the options are kept, so <code>//VALIDATE</code> stays
                    meaningful.
                  </small>
                </div>
              </div>
              <div className="routine-form-grid">
                <TextField
                  label="Application"
                  value={state.application}
                  onChange={(application) => patch({ application })}
                  placeholder="FUNDS.TRANSFER"
                  spellCheck={false}
                />
                <TextField
                  label="Version"
                  value={state.version}
                  onChange={(version) => patch({ version })}
                  placeholder="Version name, without the application"
                  spellCheck={false}
                />
                <OptionSelect
                  label="Function"
                  value={state.fn}
                  options={FUNCTIONS}
                  onChange={(fn) => patch({ fn })}
                />
                <OptionSelect
                  label="Processing flag"
                  value={state.processing}
                  options={PROCESSING_FLAGS}
                  onChange={(processing) => patch({ processing })}
                />
                <TextField
                  label="GTS control"
                  value={state.gts}
                  onChange={(gts) => patch({ gts })}
                  placeholder="Optional: 1, 2, 3, 4"
                />
                <TextField
                  label="No. of authorisers"
                  value={state.auth}
                  onChange={(auth) => patch({ auth })}
                  placeholder="Optional"
                />
              </div>
              <p className="ofs-options">
                Options segment <code>{options || '(blank)'}</code>
              </p>
            </section>
          )}

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>User and record</h2>
                <small>Never put real banking credentials in shared messages or screenshots.</small>
              </div>
            </div>
            <div className="routine-form-grid">
              <TextField
                label="User"
                value={state.user}
                onChange={(user) => patch({ user })}
                placeholder="INPUTT"
                autoComplete="off"
              />
              <TextField
                label="Password"
                type="password"
                value={state.password}
                onChange={(password) => patch({ password })}
                autoComplete="new-password"
              />
              <TextField
                label="Company"
                value={state.company}
                onChange={(company) => patch({ company })}
                placeholder="Optional, e.g. GB0010001"
              />
              {isTransaction && (
                <TextField
                  label="Transaction / record ID"
                  value={state.transactionId}
                  onChange={(transactionId) => patch({ transactionId })}
                  placeholder="Blank for a new ID"
                  spellCheck={false}
                />
              )}
            </div>
          </section>

          {isTransaction ? (
            <section className="routine-card">
              <div className="routine-card-title">
                <div>
                  <h2>Message data</h2>
                  <small>
                    One element per field. Add values with MV / SV positions for multi-values and
                    sub-values; commas are sent as <code>?</code>.
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => patch({ fields: [...state.fields, newField()] })}
                >
                  + Field
                </button>
              </div>
              {state.fields.length === 0 ? (
                <p className="muted">No fields yet. Add one, or paste message data below.</p>
              ) : (
                <div className="routine-list">
                  {state.fields.map((field, index) => (
                    <DataElement
                      key={index}
                      field={field}
                      index={index}
                      onChange={(p) => patch({ fields: updateAt(state.fields, index, p) })}
                      onRemove={() => patch({ fields: state.fields.filter((_, i) => i !== index) })}
                    />
                  ))}
                </div>
              )}
              <details className="ofs-paste">
                <summary>Paste message data</summary>
                <textarea
                  aria-label="Message data"
                  rows={3}
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  placeholder="APPLICATION:1:=SECTOR,DESCRIPT:1:2=Industrie"
                  spellCheck={false}
                />
                <div className="ofs-inline-actions">
                  <button type="button" onClick={parseRawData}>
                    Replace fields with this data
                  </button>
                  <button type="button" onClick={() => setRawData(data)} disabled={!data}>
                    Copy fields into the box
                  </button>
                </div>
              </details>
            </section>
          ) : (
            <GenericRequest state={state} patch={patch} />
          )}

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>Parse a message</h2>
                <small>Paste a complete OFS message to fill the form from it.</small>
              </div>
            </div>
            <textarea
              aria-label="OFS message to parse"
              className="ofs-full"
              rows={4}
              value={fullMessage}
              onChange={(e) => setFullMessage(e.target.value)}
              placeholder="HELPTEXT.MENU,OFS.DEMO/I/PROCESS,TEST.USER/654321,OFS.TEST,APPLICATION:1:=SECTOR"
              spellCheck={false}
            />
            <div className="ofs-inline-actions">
              <button type="button" className="primary" onClick={parseFull}>
                Parse into form
              </button>
              <button
                type="button"
                onClick={() => setFullMessage(message || '')}
                disabled={!message}
              >
                Use generated message
              </button>
            </div>
            {parsed && <ParseSummary parsed={parsed} />}
          </section>
        </div>

        <aside className="routine-preview-card">
          <div className="routine-preview-head">
            <div>
              <h2>Generated OFS</h2>
              <span className={'routine-status ' + (error ? 'warn' : 'ok')}>
                {error ? 'Incomplete' : `${state.type} · ${message.length} chars`}
              </span>
            </div>
            <button type="button" onClick={() => cp(message, 'OFS copied')} disabled={!message}>
              Copy
            </button>
          </div>
          <pre className="ofs-output" aria-label="Generated OFS message" aria-live="polite">
            {message || <span className="ofs-output-hint">{error}</span>}
          </pre>
          <dl className="ofs-rules">
            <dt>Field</dt>
            <dd>
              <code>FIELD=VALUE</code>
            </dd>
            <dt>Multi-value</dt>
            <dd>
              <code>FIELD:1=VALUE</code>
            </dd>
            <dt>Sub-value</dt>
            <dd>
              <code>FIELD:1:2=VALUE</code>
            </dd>
            <dt>Comma</dt>
            <dd>
              Sent as <code>?</code> inside a value.
            </dd>
            <dt>ID</dt>
            <dd>The 4th part: the record ID for a transaction.</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function ParseSummary({ parsed: { type, parts } }) {
  const [operation, options, user, id, data] = parts;
  // Show who the message runs as, never the password.
  const [name = '', , company = ''] = user.split('/');
  const userText = user ? [name, '••••', company].filter(Boolean).join(' / ') : '';
  const fields = type === 'Transaction' ? parseData(data) : [];
  return (
    <div className="ofs-parsed" aria-label="Parsed message">
      <dl>
        {[
          ['Type', type],
          ['Operation', operation],
          ['Options', options],
          ['User', userText],
          ['ID', id],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || <span className="muted">(blank)</span>}</dd>
          </div>
        ))}
      </dl>
      {fields.length > 0 && (
        <div className="json-table-wrap">
          <table className="json-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>MV</th>
                <th>SV</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {fields.flatMap((f) =>
                f.values.map((v, i) => (
                  <tr key={f.name + i}>
                    <td>{f.name}</td>
                    <td>{v.mv}</td>
                    <td>{v.sv}</td>
                    <td>{v.value}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
