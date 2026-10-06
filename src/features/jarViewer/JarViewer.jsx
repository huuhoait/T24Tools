import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { siteKnowledgeUrl } from '../../lib/knowledge';
import { SITE_RELEASES } from '../../lib/siteKnowledge';
import { toast } from '../../lib/toast';
import { TreeView } from '../jsonViewer/JsonViewer';
import { ROOT_ID, ancestorIds, defaultExpanded, formatBytes } from '../jsonViewer/jsonTree';
import {
  classesInJar,
  compareReleases,
  decodeClassIndex,
  listJars,
  searchClasses,
  visibleTypesAfterLoad,
} from './classIndex';

// Release comparison wording, [a, b] = the two loaded releases in order (e.g. R23, R25).
const BADGE = {
  same: () => 'same JAR in both',
  moved: (d) => `moved: ${d.a.join(', ')} → ${d.b.join(', ')}`,
  onlyA: (d, [a]) => `${a} only`,
  onlyB: (d, [, b]) => `${b} only`,
};
const SHORT_BADGE = {
  same: () => 'same JAR',
  moved: () => 'moved',
  onlyA: ([a]) => `${a} only`,
  onlyB: ([, b]) => `${b} only`,
};

function Kind({ c }) {
  const bits = [c.type, c.isInterface && 'interface', c.isAbstract && 'abstract'];
  return <small className="muted">{bits.filter(Boolean).join(' · ')}</small>;
}

function Badge({ status, releases }) {
  return status ? (
    <span className={`jar-badge ${status}`}>{SHORT_BADGE[status](releases)}</span>
  ) : null;
}

function ClassDetail({ entries, index, diff, releases, onOpen }) {
  const c = entries[0];
  const known = (q) => index.byQualified.has(q);
  const link = (q) =>
    known(q) ? (
      <button type="button" className="link-button" onClick={() => onOpen(q)}>
        {q}
      </button>
    ) : (
      <code>{q}</code>
    );
  const d = diff?.get(c.qualified);
  return (
    <section className="jar-detail" aria-label="Class detail">
      <h2>{c.name}</h2>
      <p className="muted">
        <code>{c.package}</code> <Kind c={c} />
      </p>
      <table>
        <tbody>
          <tr>
            <th>JAR</th>
            <td>
              {entries.map((e) => (
                <code key={e.jar} className="jar-name">
                  {e.jar}
                </code>
              ))}
              {entries.length > 1 && <small className="muted"> (in {entries.length} JARs)</small>}
            </td>
          </tr>
          {c.superclass && (
            <tr>
              <th>Extends</th>
              <td>{link(c.superclass)}</td>
            </tr>
          )}
          {c.interfaces.length > 0 && (
            <tr>
              <th>Implements</th>
              <td>
                {c.interfaces.map((q) => (
                  <div key={q}>{link(q)}</div>
                ))}
              </td>
            </tr>
          )}
          {d && (
            <tr>
              <th>{releases.join(' → ')}</th>
              <td>{BADGE[d.status](d, releases)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              ?.writeText(`import ${c.qualified};`)
              .then(() => toast.success('Import copied'))
          }
        >
          Copy import
        </button>{' '}
        <code>import {c.qualified};</code>
      </p>
      {c.methods && (
        <>
          <h3>Public methods ({c.methods.length})</h3>
          <ul className="jar-methods">
            {c.methods.map(([name, ret, params], i) => (
              <li key={i}>
                <code>
                  {ret} {name}({params.join(', ')})
                </code>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** JAR list on the left, the chosen JAR's classes on the right and the chosen class below them. */
function JarsView({ index, diff, releases, shown, setShown }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [jar, setJar] = useState('');
  const [selected, setSelected] = useState('');
  const classRow = useRef(null);
  const detailBox = useRef(null);

  const jars = useMemo(() => listJars(index, deferred, { types: shown }), [index, deferred, shown]);
  const classHits = useMemo(
    () => searchClasses(index, deferred, { types: shown }),
    [index, deferred, shown],
  );
  const current = index.jars.includes(jar) ? jar : '';
  const groups = useMemo(
    () => (current ? classesInJar(index, current, shown) : null),
    [index, current, shown],
  );
  const classCount = groups ? [...groups.values()].reduce((n, list) => n + list.length, 0) : 0;
  const detail = selected ? index.byQualified.get(selected) : null;
  const status = (q) => diff?.get(q)?.status;

  useEffect(() => {
    classRow.current?.scrollIntoView?.({ block: 'nearest' });
    detailBox.current?.scrollIntoView?.({ block: 'nearest' });
  }, [current, selected]);

  /** Opens a class: its JAR on the right (the first, if it is in several) and its detail below. */
  function open(qualified, inJar) {
    const entries = index.byQualified.get(qualified);
    if (!entries) return;
    setJar(inJar && entries.some((e) => e.jar === inJar) ? inJar : entries[0].jar);
    setSelected(qualified);
  }

  return (
    <div className="json-apps jar-browser">
      <aside className="json-apps-list">
        <input
          aria-label="Search JARs and classes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="JAR, class or package name"
        />
        <fieldset className="jar-types" aria-label="Show types">
          {index.types.map((t) => (
            <label key={t}>
              <input
                type="checkbox"
                aria-label={t}
                checked={shown.has(t)}
                onChange={() =>
                  setShown((cur) => {
                    const next = new Set(cur);
                    next.has(t) ? next.delete(t) : next.add(t);
                    return next;
                  })
                }
              />{' '}
              {t}
            </label>
          ))}
        </fieldset>
        <small className="muted">
          {deferred.trim()
            ? `${jars.length.toLocaleString()} of ${index.jars.length.toLocaleString()} JARs`
            : `${index.jars.length.toLocaleString()} JARs`}
        </small>
        <ul aria-label="JARs">
          {jars.map((j) => (
            <li key={j.jar}>
              <button
                type="button"
                className={j.jar === current ? 'on' : undefined}
                aria-current={j.jar === current ? 'true' : undefined}
                onClick={() => {
                  setJar(j.jar);
                  setSelected('');
                }}
              >
                {j.jar}
                <small className="muted"> · {j.count.toLocaleString()}</small>
              </button>
            </li>
          ))}
        </ul>
        {classHits.total > 0 && (
          <>
            <small className="muted">
              {classHits.total.toLocaleString()} class(es)
              {classHits.total > classHits.results.length
                ? ` · showing the best ${classHits.results.length}`
                : ''}
            </small>
            <ul aria-label="Classes found">
              {classHits.results.map((c) => (
                <li key={c.qualified + c.jar}>
                  <button
                    type="button"
                    className={c.qualified === selected && c.jar === current ? 'on' : undefined}
                    title={`${c.qualified} · ${c.jar}`}
                    onClick={() => open(c.qualified, c.jar)}
                  >
                    {c.name}
                    <small className="muted"> · {c.jar}</small>{' '}
                    <Badge status={status(c.qualified)} releases={releases} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <section className="json-app-detail" aria-label="JAR">
        {!current ? (
          <p className="muted">Choose a JAR to see its classes, or search for a class.</p>
        ) : (
          <>
            <div className="json-app-head">
              <div>
                <h2>{current}</h2>
                <p className="muted">
                  {classCount.toLocaleString()} classes · {groups.size.toLocaleString()} packages
                  {shown.size < index.types.length && ' · shown types only'}
                </p>
              </div>
            </div>
            <div className="jar-classes" aria-label="Classes in JAR">
              {groups.size === 0 && (
                <p className="muted">No classes of the shown types: tick more types.</p>
              )}
              {[...groups].map(([pkg, list]) => (
                <div key={pkg}>
                  <h3>
                    <code>{pkg || '(default package)'}</code>{' '}
                    <small className="muted">{list.length}</small>
                  </h3>
                  {list.map((c) => (
                    <button
                      key={c.qualified}
                      ref={c.qualified === selected ? classRow : undefined}
                      type="button"
                      className="jar-hit"
                      aria-current={c.qualified === selected ? 'true' : undefined}
                      onClick={() => open(c.qualified, current)}
                    >
                      <b>{c.name}</b> <Kind c={c} />
                      <Badge status={status(c.qualified)} releases={releases} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        {detail && (
          <div ref={detailBox}>
            <ClassDetail
              entries={detail}
              index={index}
              diff={diff}
              releases={releases}
              onOpen={(q) => open(q)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

export function JarViewer() {
  const fileInput = useRef(null);
  const [indexes, setIndexes] = useState({}); // release -> decoded index (session only)
  const [docs, setDocs] = useState({}); // release -> classes.json as read, for the JSON tree
  const [active, setActive] = useState('');
  const [shown, setShown] = useState(null); // Set of visible types; null until an index loads
  const [view, setView] = useState('tree');
  const [expanded, setExpanded] = useState(() => new Set([ROOT_ID]));
  const [reveal, setReveal] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [dragging, setDragging] = useState(false);

  const index = indexes[active];
  const releases = Object.keys(indexes).sort();
  const diff = useMemo(
    () =>
      releases.length === 2 ? compareReleases(indexes[releases[0]], indexes[releases[1]]) : null,
    [indexes], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function show(release, doc) {
    setActive(release);
    setExpanded(defaultExpanded(doc));
    setReveal(null);
  }

  function add(doc) {
    const decoded = decodeClassIndex(doc);
    setIndexes((cur) => ({ ...cur, [decoded.release]: decoded }));
    setDocs((cur) => ({ ...cur, [decoded.release]: doc }));
    show(decoded.release, doc);
    const loadedTypes = Object.values(indexes).map((i) => i.types);
    setShown((cur) => visibleTypesAfterLoad(cur, loadedTypes, decoded.types));
    setError('');
  }

  async function run(label, load) {
    setBusy(label);
    setError('');
    try {
      add(await load());
    } catch (e) {
      setError(`${label}: ${e.message}`);
    } finally {
      setBusy('');
    }
  }

  const loadSite = (r) =>
    run(`Load ${r}`, async () => {
      const res = await fetch(siteKnowledgeUrl(r, 'classes.json'));
      if (!res.ok) throw new Error(`HTTP ${res.status} — upload a classes.json instead`);
      return res.json();
    });

  async function loadFiles(files) {
    for (const file of [...(files || [])])
      await run(`${file.name} (${formatBytes(file.size)})`, async () =>
        JSON.parse(await file.text()),
      );
  }

  function showInTree(path) {
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of ancestorIds(path)) next.add(id);
      return next;
    });
    setReveal({ path });
    setView('tree');
  }

  const dropProps = {
    onDragOver: (e) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      loadFiles(e.dataTransfer.files);
    },
  };

  return (
    <div className="routine-creator json-viewer jar-viewer">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">JAR Viewer</span>
          <h1>Which JAR holds a T24 class?</h1>
          <p className="muted">
            Load a release&apos;s <code>classes.json</code> to browse its JARs and the classes in
            each, or read the file as a JSON tree. Load R23 and R25 to see which classes moved
            between JARs. Everything stays in this browser.
          </p>
        </div>
      </div>

      <section className="routine-card json-source" aria-label="Class index">
        <div className="json-source-bar">
          <div className="json-site-load">
            {SITE_RELEASES.map((r) => (
              <button key={r} type="button" disabled={!!busy} onClick={() => loadSite(r)}>
                {busy === `Load ${r}` ? `Loading ${r}…` : `Load ${r} from this site`}
              </button>
            ))}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          aria-label="classes.json file"
          onChange={(e) => {
            loadFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className={`json-dropzone${dragging ? ' dragging' : ''}`} {...dropProps}>
          <span className="json-dropzone-icon" aria-hidden="true">
            ⇪
          </span>
          <b>Drop classes.json files here</b>
          <span className="muted">or</span>
          <button
            type="button"
            className="primary"
            disabled={!!busy}
            onClick={() => fileInput.current?.click()}
          >
            Open classes.json…
          </button>
          <small className="muted">
            One file per release; R23 and R25 together show which classes moved. Files are read in
            this browser only and never sent to a server.
          </small>
        </div>
        <div className="json-source-actions">
          <div className="json-meta" role="status">
            {busy ? (
              <span className="json-busy">{busy}…</span>
            ) : releases.length ? (
              <div className="jar-releases">
                {releases.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={r === active ? 'active' : undefined}
                    aria-pressed={r === active}
                    onClick={() => show(r, docs[r])}
                  >
                    {r} · {indexes[r].classes.length.toLocaleString()} classes ·{' '}
                    {indexes[r].jars.length.toLocaleString()} JARs
                  </button>
                ))}
              </div>
            ) : (
              <span className="muted">Nothing loaded yet.</span>
            )}
          </div>
        </div>
        {error && (
          <p className="routine-validation invalid" role="alert">
            {error}
          </p>
        )}
      </section>

      {index && (
        <section className="routine-card json-output" aria-label={`${active} classes.json`}>
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={view === 'tree'}
              className={view === 'tree' ? 'active' : undefined}
              onClick={() => setView('tree')}
            >
              JSON tree
            </button>
            <button
              role="tab"
              aria-selected={view === 'jars'}
              className={view === 'jars' ? 'active' : undefined}
              onClick={() => setView('jars')}
            >
              JARs
            </button>
          </div>
          {view === 'jars' ? (
            <JarsView
              key={active}
              index={index}
              diff={diff}
              releases={releases}
              shown={shown}
              setShown={setShown}
            />
          ) : (
            <TreeView
              key={active}
              root={docs[active]}
              expanded={expanded}
              setExpanded={setExpanded}
              reveal={reveal}
              onReveal={showInTree}
            />
          )}
        </section>
      )}
    </div>
  );
}
