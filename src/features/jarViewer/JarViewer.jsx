import { useMemo, useRef, useState } from 'react';
import { siteKnowledgeUrl } from '../../lib/knowledge';
import { SITE_RELEASES } from '../../lib/siteKnowledge';
import { toast } from '../../lib/toast';
import { formatBytes } from '../jsonViewer/jsonTree';
import {
  classesInJar,
  compareReleases,
  decodeClassIndex,
  isJarQuery,
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
    <section className="routine-card jar-detail" aria-label="Class detail">
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

export function JarViewer() {
  const fileInput = useRef(null);
  const [indexes, setIndexes] = useState({}); // release -> decoded index (session only)
  const [active, setActive] = useState('');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(null); // Set of visible types; null until an index loads
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const index = indexes[active];
  const releases = Object.keys(indexes).sort();
  const diff = useMemo(
    () =>
      releases.length === 2 ? compareReleases(indexes[releases[0]], indexes[releases[1]]) : null,
    [indexes], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function add(doc) {
    const decoded = decodeClassIndex(doc);
    setIndexes((cur) => ({ ...cur, [decoded.release]: decoded }));
    setActive(decoded.release);
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

  const loadFile = (file) =>
    file &&
    run(`${file.name} (${formatBytes(file.size)})`, async () => JSON.parse(await file.text()));

  const jar = index ? isJarQuery(index, query) : null;
  const found = index && !jar ? searchClasses(index, query, { types: shown }) : null;
  const detail = index && selected ? index.byQualified.get(selected) : null;
  const badge = (q) => diff?.get(q)?.status;

  return (
    <div className="routine-creator jar-viewer">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">JAR Viewer</span>
          <h1>Which JAR holds a T24 class?</h1>
          <p className="muted">
            Load a release&apos;s <code>classes.json</code> and search a class, package or JAR name.
            Load R23 and R25 to see which classes moved between JARs.
          </p>
        </div>
      </div>

      <section className="routine-card" aria-label="Class index">
        <div className="routine-creator-actions">
          {SITE_RELEASES.map((r) => (
            <button key={r} type="button" disabled={!!busy} onClick={() => loadSite(r)}>
              {busy === `Load ${r}` ? `Loading ${r}…` : `Load ${r} from this site`}
            </button>
          ))}
          <button type="button" className="primary" onClick={() => fileInput.current?.click()}>
            Open classes.json…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="classes.json file"
            onChange={(e) => {
              loadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {error && (
          <p className="routine-validation" role="alert">
            {error}
          </p>
        )}
        {releases.length > 0 && (
          <div className="jar-releases" role="status">
            {releases.map((r) => (
              <button
                key={r}
                type="button"
                className={r === active ? 'active' : undefined}
                aria-pressed={r === active}
                onClick={() => setActive(r)}
              >
                {r} · {indexes[r].classes.length.toLocaleString()} classes ·{' '}
                {indexes[r].jars.length.toLocaleString()} JARs
              </button>
            ))}
          </div>
        )}
      </section>

      {index && (
        <section className="routine-card" aria-label="Search">
          <input
            className="jar-search"
            aria-label="Search classes, packages or JARs"
            placeholder="Class, package or JAR name — e.g. RecordLifecycle or EB_TemplateHook.jar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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

          {jar && (
            <div className="jar-list">
              <h2>{jar}</h2>
              {[...classesInJar(index, jar)].map(([pkg, list]) => (
                <div key={pkg}>
                  <h3>
                    <code>{pkg}</code> <small className="muted">{list.length}</small>
                  </h3>
                  {list.map((c) => (
                    <button
                      key={c.qualified}
                      type="button"
                      className="jar-hit"
                      onClick={() => setSelected(c.qualified)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {found && query.trim().length >= 2 && (
            <div className="jar-list">
              <p className="muted">
                {found.total.toLocaleString()} match{found.total === 1 ? '' : 'es'}
                {found.total > found.results.length &&
                  ` — showing the best ${found.results.length}, refine to narrow`}
              </p>
              {found.results.map((c) => (
                <button
                  key={c.qualified + c.jar}
                  type="button"
                  className="jar-hit"
                  aria-current={c.qualified === selected ? 'true' : undefined}
                  onClick={() => setSelected(c.qualified)}
                >
                  <b>{c.name}</b> <code>{c.package}</code> <span className="jar-name">{c.jar}</span>
                  {badge(c.qualified) && (
                    <span className={`jar-badge ${badge(c.qualified)}`}>
                      {SHORT_BADGE[badge(c.qualified)](releases)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {detail && (
        <ClassDetail
          entries={detail}
          index={index}
          diff={diff}
          releases={releases}
          onOpen={setSelected}
        />
      )}
    </div>
  );
}
