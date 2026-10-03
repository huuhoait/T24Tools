import { useEffect, useMemo, useRef, useState } from 'react';
import TEMPLATES from '../../data/templates.json';
import { cp, dl } from '../../lib/text';
import { toast } from '../../lib/toast';
import { fieldsFor, listApps } from './catalog';
import { checkFields } from './fieldCheck';
import { createKnowledgeStore } from './knowledgeStore';
import { localIsoDate, render, resolve } from './render';

const store = createKnowledgeStore();

function Step({ n, title, hint, children, done }) {
  return (
    <section className={`routine-card artefact-step${done ? ' done' : ''}`} aria-label={title}>
      <div className="routine-card-title">
        <div>
          <span className="eyebrow">Step {n}</span>
          <h2>{title}</h2>
          {hint && <p className="muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ChoiceList({ name, options, value, onChange }) {
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

function AppInput({ spec, value, knowledge, onChange }) {
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

function FieldInput({ spec, app, value, knowledge, language, onChange }) {
  const fields = useMemo(() => fieldsFor(knowledge, app, language), [knowledge, app, language]);
  if (!app) return <p className="muted">Choose the application first.</p>;
  if (!fields.length) return <p className="muted">{app} is not in this release.</p>;
  return (
    <select aria-label={spec.label} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a field…</option>
      {fields.map((f) => (
        <option key={f.name} value={f.name} disabled={Boolean(f.disabled)}>
          {f.position} · {f.name}
          {f.kind ? ` [${f.kind}]` : ''}
          {f.disabled
            ? ` — ${f.disabled}`
            : language !== 'infobasic' && f.code
              ? ` → ${f.code}`
              : ''}
        </option>
      ))}
    </select>
  );
}

export function ArtefactGenerator() {
  const [releases, setReleases] = useState([]);
  const [release, setRelease] = useState('');
  const [knowledge, setKnowledge] = useState(null);
  const [language, setLanguage] = useState('');
  const [typeId, setTypeId] = useState('');
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeFile, setActiveFile] = useState('');
  const [loadState, setLoadState] = useState({ busy: false, error: '' });
  const fileInput = useRef(null);

  useEffect(() => {
    store.listReleases().then((list) => {
      setReleases(list);
      if (list.length === 1) setRelease(list[0]);
    });
  }, []);

  useEffect(() => {
    if (!release) return setKnowledge(null);
    store.get(release).then(setKnowledge);
  }, [release]);

  const lang = TEMPLATES.languages.find((l) => l.id === language);
  const typeEntry = lang?.types.find((t) => t.id === typeId);
  const template = typeEntry?.template ? TEMPLATES.templates[typeEntry.template] : null;

  function reset(level) {
    if (level <= 1) setLanguage('');
    if (level <= 2) setTypeId('');
    if (level <= 3) setInputs({});
    setResult(null);
    setError('');
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLoadState({ busy: true, error: '' });
    try {
      const loaded = await store.loadText(await file.text());
      setLoadState({ busy: false, error: '' });
      setReleases(await store.listReleases());
      setRelease(loaded.release);
      reset(1);
      toast.success(
        `Loaded ${loaded.release}: ${loaded.appCount.toLocaleString()} applications, ${loaded.fieldCount.toLocaleString()} fields` +
          (loaded.persisted ? '' : ' (this browser blocks storage: it will not be remembered)'),
      );
    } catch (e) {
      // Kept on screen (a toast alone disappears before a large file's error is noticed).
      setLoadState({ busy: false, error: `${file.name}: ${e.message}` });
      toast.error(e.message);
    }
  }

  function chooseType(id) {
    setTypeId(id);
    const t = lang.types.find((x) => x.id === id);
    const tpl = t?.template ? TEMPLATES.templates[t.template] : null;
    const fixed = Object.fromEntries(
      (tpl?.inputs || []).filter((i) => i.fixed).map((i) => [i.id, i.fixed]),
    );
    setInputs(fixed);
    setResult(null);
    setError('');
  }

  function generate() {
    setError('');
    try {
      const empty = template.inputs
        .filter((i) => !String(inputs[i.id] ?? '').trim())
        .map((i) => i.label);
      if (empty.length) throw new Error(`Fill in: ${empty.join(', ')}`);
      const values = resolve(template, inputs, knowledge, localIsoDate());
      const files = render(template, values);
      const apps = template.inputs
        .filter((i) => i.kind === 'app')
        .map((i) => String(inputs[i.id]).toUpperCase());
      const main = Object.keys(files).find((f) => f.endsWith('.b'));
      const checks =
        language === 'java' || !main
          ? []
          : apps.map((app) => ({ app, ...checkFields(knowledge, app, files[main]) }));
      setResult({ files, checks });
      setActiveFile(
        Object.keys(files).find((f) => !f.endsWith('.component')) || Object.keys(files)[0],
      );
    } catch (e) {
      setResult(null);
      setError(e.message);
    }
  }

  const releaseOptions = releases.map((r) => ({ id: r, label: r }));
  const languageOptions = TEMPLATES.languages.map((l) => ({
    id: l.id,
    label: l.label,
    badge: `${l.types.filter((t) => t.proven).length}/${l.types.length}`,
  }));
  const typeOptions = (lang?.types || []).map((t) => ({
    id: t.id,
    label: t.label,
    disabled: !t.proven,
    badge: t.proven ? 'compile-verified' : 'coming soon',
  }));
  const missingAll = result?.checks.flatMap((c) => c.missing || []) || [];

  return (
    <div className="routine-creator artefact-generator">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">Artefact Generator</span>
          <h1>Generate a T24 routine or hook</h1>
          <p className="muted">
            Choose the release, the language and the routine type, fill in the inputs, and get
            source code built from templates whose examples compile against a real T24 install.
            Field names come from a knowledge file you load yourself — it stays in this browser and
            is never uploaded.
          </p>
        </div>
      </div>

      <Step
        n={1}
        title="Release"
        hint="Which T24 release the code is for."
        done={Boolean(knowledge)}
      >
        {releaseOptions.length ? (
          <ChoiceList
            name="Release"
            options={releaseOptions}
            value={release}
            onChange={(r) => {
              setRelease(r);
              reset(1);
            }}
          />
        ) : (
          <p className="muted">No knowledge file loaded yet.</p>
        )}
        <div className="routine-creator-actions">
          <button
            type="button"
            disabled={loadState.busy}
            onClick={() => fileInput.current?.click()}
          >
            {loadState.busy ? 'Reading knowledge file…' : 'Load knowledge file…'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={loadFile}
            aria-label="Knowledge file"
          />
          <small className="muted">
            A <code>fields.json</code> exported from your own Temenos-Skills (one per release). It
            is kept only in this browser.
          </small>
        </div>
        {loadState.error && (
          <p className="routine-validation" role="alert">
            {loadState.error}
          </p>
        )}
        {knowledge && (
          <p className="muted">
            {knowledge.release}: {knowledge.appCount?.toLocaleString()} applications ·{' '}
            {knowledge.fieldCount?.toLocaleString()} fields
          </p>
        )}
      </Step>

      {knowledge && (
        <Step
          n={2}
          title="Language"
          hint="Badges show how many routine types are available."
          done={Boolean(language)}
        >
          <ChoiceList
            name="Language"
            options={languageOptions}
            value={language}
            onChange={(l) => {
              setLanguage(l);
              reset(2);
            }}
          />
        </Step>
      )}

      {lang && (
        <Step
          n={3}
          title="Routine type"
          hint="Types marked coming soon have no compile-verified template yet."
          done={Boolean(template)}
        >
          <ChoiceList
            name="Routine type"
            options={typeOptions}
            value={typeId}
            onChange={chooseType}
          />
          {template && <p className="muted artefact-description">{template.description}</p>}
        </Step>
      )}

      {template && (
        <Step n={4} title="Inputs" hint="Field lists are filtered for the release and language.">
          <div className="routine-form-grid artefact-inputs">
            {template.inputs.map((spec) => (
              <label key={spec.id}>
                <span>{spec.label}</span>
                {spec.kind === 'app' ? (
                  <AppInput
                    spec={spec}
                    value={inputs[spec.id]}
                    knowledge={knowledge}
                    onChange={(v) => {
                      // A field chosen for the previous application is not valid for this one.
                      const next = { ...inputs, [spec.id]: v };
                      for (const f of template.inputs)
                        if (f.kind === 'field' && f.of === spec.id) delete next[f.id];
                      setInputs(next);
                    }}
                  />
                ) : spec.kind === 'field' ? (
                  <FieldInput
                    spec={spec}
                    app={String(inputs[spec.of] || '').toUpperCase()}
                    value={inputs[spec.id]}
                    knowledge={knowledge}
                    language={language}
                    onChange={(v) => setInputs({ ...inputs, [spec.id]: v })}
                  />
                ) : (
                  <input
                    aria-label={spec.label}
                    value={inputs[spec.id] || ''}
                    placeholder={spec.example || ''}
                    onChange={(e) => setInputs({ ...inputs, [spec.id]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="routine-creator-actions">
            <button type="button" className="primary" onClick={generate}>
              Generate
            </button>
          </div>
          {error && (
            <p className="routine-validation" role="alert">
              {error}
            </p>
          )}
        </Step>
      )}

      {result && (
        <Step
          n={5}
          title="Generated code"
          hint="Check the field names below, then copy or download the files."
        >
          <div className="tabs artefact-files" role="tablist">
            {Object.keys(result.files).map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={activeFile === name}
                className={activeFile === name ? 'active' : undefined}
                onClick={() => setActiveFile(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <pre className="routine-output artefact-output" aria-label={`Generated ${activeFile}`}>
            {result.files[activeFile]}
          </pre>
          <div className="routine-creator-actions">
            <button
              type="button"
              onClick={() => cp(result.files[activeFile], `Copied ${activeFile}`)}
            >
              Copy
            </button>
            <button type="button" onClick={() => dl(activeFile, result.files[activeFile])}>
              Download
            </button>
          </div>
          {language === 'java' ? (
            <p className="muted">
              Java: the getters come from single-value fields of the selected release. Compile it
              against your T24 libraries before deploying.
            </p>
          ) : (
            <p className={missingAll.length ? 'routine-validation' : 'muted'} role="status">
              {missingAll.length
                ? `Field check: not found in ${release}: ${missingAll.join(', ')}`
                : `Field check: ${result.checks.flatMap((c) => c.verified || []).length} field reference(s) verified against ${release}.`}
            </p>
          )}
        </Step>
      )}
    </div>
  );
}
