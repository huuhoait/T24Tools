// Release, application and field pickers shared by the Artefact Generator and the Routine Builder.

import { useMemo, useState } from 'react';
import { fieldsFor, listApps } from './catalog';
import { fieldList } from './multiField';

export function ChoiceList({ name, options, value, onChange }) {
  return (
    <div className="artefact-choices" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label
          key={o.id}
          className={`artefact-choice${o.disabled ? ' disabled' : ''}${value === o.id ? ' on' : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            disabled={Boolean(o.disabled)}
            onChange={() => onChange(o.id)}
          />
          <span>{o.label}</span>
          {o.badge && <small className="artefact-badge">{o.badge}</small>}
        </label>
      ))}
    </div>
  );
}

export function AppInput({ spec, value, knowledge, onChange }) {
  const listId = `apps-${spec.id}`;
  const suggestions = useMemo(() => listApps(knowledge, value || '', 50), [knowledge, value]);
  if (spec.fixed)
    return (
      <input aria-label={spec.label} value={spec.fixed} readOnly title="Fixed by this hook type" />
    );
  return (
    <>
      <input
        aria-label={spec.label}
        list={listId}
        value={value || ''}
        placeholder="Type to search the release's applications"
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <datalist id={listId}>
        {suggestions.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </>
  );
}

/**
 * Field list for one field input: a filterable list of the app's fields with checkboxes (several
 * fields, Select all / Clear) or single choice, where the template needs exactly one field.
 */
export function FieldPicker({ spec, app, value, knowledge, language, multiple, onChange }) {
  const fields = useMemo(() => fieldsFor(knowledge, app, language), [knowledge, app, language]);
  const [filter, setFilter] = useState('');
  const selected = useMemo(() => new Set(fieldList(value)), [value]);
  if (!app) return <p className="muted">Choose the application first.</p>;
  if (!fields.length) return <p className="muted">{app} is not in this release.</p>;

  const q = filter.trim().toUpperCase();
  const shown = q
    ? fields.filter(
        (f) => f.name.includes(q) || String(f.position) === q || f.code.toUpperCase().includes(q),
      )
    : fields;
  const enabled = fields.filter((f) => !f.disabled);
  const shownEnabled = shown.filter((f) => !f.disabled);
  // Selections keep the application's field order, whatever order they were ticked in.
  const choose = (keep) => onChange(enabled.filter((f) => keep(f.name)).map((f) => f.name));
  const toggle = (name) =>
    multiple ? choose((n) => (n === name ? !selected.has(n) : selected.has(n))) : onChange(name);
  const shownNames = new Set(shownEnabled.map((f) => f.name));

  return (
    <div className="field-picker" role="group" aria-label={spec.label}>
      <div className="field-picker-bar">
        <input
          type="search"
          aria-label={`Filter ${spec.label}`}
          value={filter}
          placeholder="Filter by name, position or code"
          onChange={(e) => setFilter(e.target.value)}
        />
        {multiple && (
          <>
            <button
              type="button"
              disabled={!shownEnabled.length}
              onClick={() => choose((n) => selected.has(n) || shownNames.has(n))}
            >
              {q ? `Select shown (${shownEnabled.length})` : `Select all (${enabled.length})`}
            </button>
            <button type="button" disabled={!selected.size} onClick={() => onChange([])}>
              Clear
            </button>
          </>
        )}
        <small className="muted" aria-live="polite">
          {multiple
            ? `${selected.size} of ${enabled.length} selected`
            : selected.size
              ? `Selected: ${[...selected][0]}`
              : 'Choose one field'}
        </small>
      </div>
      <ul className="field-picker-list">
        {shown.map((f) => (
          <li key={`${f.position}-${f.name}`}>
            <label
              className={`field-picker-item${selected.has(f.name) ? ' on' : ''}${f.disabled ? ' disabled' : ''}`}
              title={f.disabled || undefined}
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={`field-${spec.id}`}
                value={f.name}
                checked={selected.has(f.name)}
                disabled={Boolean(f.disabled)}
                onChange={() => toggle(f.name)}
              />
              <span className="field-picker-pos">{f.position}</span>
              <span className="field-picker-name">{f.name}</span>
              {f.kind && <span className="artefact-badge">{f.kind}</span>}
              <span className="field-picker-note">
                {f.disabled ? f.disabled : language !== 'infobasic' && f.code ? `→ ${f.code}` : ''}
              </span>
            </label>
          </li>
        ))}
        {!shown.length && (
          <li className="muted field-picker-empty">No field matches “{filter}”.</li>
        )}
      </ul>
    </div>
  );
}
