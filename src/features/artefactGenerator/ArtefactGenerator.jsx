import { useCallback, useEffect, useState } from 'react';
import { KnowledgePanel } from '../../components/KnowledgePanel';
import TEMPLATES from '../../data/templates.json';
import { knowledgeStore } from '../../lib/knowledge';
import { cp, dl } from '../../lib/text';
import { checkFields } from './fieldCheck';
import { fieldList, generateFiles, isMultiField } from './multiField';
import { AppInput, ChoiceList, FieldPicker } from './pickers';
import { localIsoDate } from './render';

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

export function ArtefactGenerator() {
  const [release, setRelease] = useState('');
  const [knowledge, setKnowledge] = useState(null);
  const [language, setLanguage] = useState('');
  const [typeId, setTypeId] = useState('');
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeFile, setActiveFile] = useState('');

  useEffect(() => {
    if (!release) return setKnowledge(null);
    knowledgeStore.get(release).then(setKnowledge);
  }, [release]);

  const lang = TEMPLATES.languages.find((l) => l.id === language);
  const typeEntry = lang?.types.find((t) => t.id === typeId);
  const template = typeEntry?.template ? TEMPLATES.templates[typeEntry.template] : null;

  const chooseRelease = useCallback((r) => {
    setRelease(r);
    setLanguage('');
    setTypeId('');
    setInputs({});
    setResult(null);
    setError('');
  }, []);

  function reset(level) {
    if (level <= 1) setLanguage('');
    if (level <= 2) setTypeId('');
    if (level <= 3) setInputs({});
    setResult(null);
    setError('');
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
        .filter((i) =>
          i.kind === 'field' ? !fieldList(inputs[i.id]).length : !String(inputs[i.id] ?? '').trim(),
        )
        .map((i) => i.label);
      if (empty.length) throw new Error(`Fill in: ${empty.join(', ')}`);
      const files = generateFiles(template, inputs, knowledge, localIsoDate());
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
        <KnowledgePanel release={release} knowledge={knowledge} onRelease={chooseRelease} />
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
            {template.inputs.map((spec) =>
              spec.kind === 'field' ? (
                <div key={spec.id} className="wide artefact-field">
                  <span>
                    {spec.label}
                    {isMultiField(template.id, spec.id) && (
                      <small className="muted"> — one or more</small>
                    )}
                  </span>
                  <FieldPicker
                    spec={spec}
                    app={String(inputs[spec.of] || '').toUpperCase()}
                    value={inputs[spec.id]}
                    knowledge={knowledge}
                    language={language}
                    multiple={isMultiField(template.id, spec.id)}
                    onChange={(v) => setInputs({ ...inputs, [spec.id]: v })}
                  />
                </div>
              ) : (
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
                  ) : (
                    <input
                      aria-label={spec.label}
                      value={inputs[spec.id] || ''}
                      placeholder={spec.example || ''}
                      onChange={(e) => setInputs({ ...inputs, [spec.id]: e.target.value })}
                    />
                  )}
                </label>
              ),
            )}
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
