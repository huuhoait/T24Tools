import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { siteKnowledgeUrl } from '../../lib/knowledge';
import { SITE_RELEASES } from '../../lib/siteKnowledge';
import { cp, dl } from '../../lib/text';
import { toast } from '../../lib/toast';
import { listApps } from '../artefactGenerator/catalog';
import {
  ROOT_ID,
  allContainerIds,
  ancestorIds,
  buildRows,
  defaultExpanded,
  errorLocation,
  formatBytes,
  idOfPath,
  pathLabel,
  pathOfId,
  rowIndexForPath,
  searchJson,
  sizeOf,
  stats,
  valueAt,
} from './jsonTree';
import { FIELD_COLUMNS, isKnowledgeFile, knowledgeSummary, searchFields } from './knowledgeView';

const ROW_HEIGHT = 22;
const OVERSCAN = 30;
// Larger pastes and files are parsed without being put in the textarea: a browser textarea holding
// 19 MB of text is slow to paint and to edit, and the tree below is the view of it.
const LARGE_TEXT = 256 * 1024;
const TYPING_DELAY = 400;

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 16));

function Primitive({ value }) {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'string') return <span className="json-str">{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className="json-num">{String(value)}</span>;
  return <span className="json-bool">{String(value)}</span>;
}

function InlineArray({ value }) {
  return (
    <>
      <span className="json-punct">[</span>
      {value.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="json-punct">, </span>}
          <Primitive value={item} />
        </span>
      ))}
      <span className="json-punct">]</span>
    </>
  );
}

function JsonRow({ row, line, selected, onToggle, onSelect }) {
  const open = row.isArray ? '[' : '{';
  const close = row.isArray ? ']' : '}';
  const expandable = row.type === 'open' || row.type === 'collapsed';
  const comma = !row.last && row.type !== 'open' && <span className="json-punct">,</span>;
  const toggleId = row.owner || row.id;
  return (
    <div
      className={`json-row${selected ? ' selected' : ''}`}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(row)}
      onDoubleClick={() => (expandable || row.type === 'close') && onToggle(toggleId)}
    >
      <span className="json-line" aria-hidden="true">
        {line}
      </span>
      <span className="json-code" style={{ paddingLeft: row.depth * 18 }}>
        {expandable ? (
          <button
            type="button"
            className="json-toggle"
            aria-expanded={row.type === 'open'}
            aria-label={`${row.type === 'open' ? 'Collapse' : 'Expand'} ${row.key ?? (row.id === ROOT_ID ? 'root' : 'item')}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(row.id);
            }}
          >
            {row.type === 'open' ? '▾' : '▸'}
          </button>
        ) : (
          <span className="json-toggle-space" />
        )}
        {row.type === 'close' ? (
          <span className="json-punct">{close}</span>
        ) : (
          <>
            {row.key !== undefined && (
              <>
                <span className="json-key">{JSON.stringify(row.key)}</span>
                <span className="json-punct">: </span>
              </>
            )}
            {row.type === 'leaf' && <Primitive value={row.value} />}
            {row.type === 'inline' && <InlineArray value={row.value} />}
            {row.type === 'open' && <span className="json-punct">{open}</span>}
            {row.type === 'collapsed' && (
              <>
                <span className="json-punct">{open}</span>
                <span className="json-ellipsis">…</span>
                <span className="json-punct">{close}</span>
              </>
            )}
          </>
        )}
        {comma}
        {(row.type === 'collapsed' || row.type === 'open') && (
          <span className="json-count">
            {' '}
            {sizeOf(row.value).toLocaleString()} {row.isArray ? 'items' : 'keys'}
          </span>
        )}
      </span>
    </div>
  );
}

/** Renders only the rows inside the scroll window, so a million-row tree scrolls smoothly. */
function VirtualTree({ rows, selectedId, scrollTo, onToggle, onSelect }) {
  const box = useRef(null);
  const [view, setView] = useState({ top: 0, height: 640 });

  useEffect(() => {
    const el = box.current;
    if (el) setView({ top: el.scrollTop, height: el.clientHeight || 640 });
  }, [rows]);

  useEffect(() => {
    const el = box.current;
    if (!el || !scrollTo || scrollTo.index < 0) return;
    const y = scrollTo.index * ROW_HEIGHT;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - ROW_HEIGHT * 2)
      el.scrollTop = Math.max(0, y - el.clientHeight / 3);
  }, [scrollTo]);

  const start = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN);
  return (
    <div
      ref={box}
      className="json-scroll"
      aria-label="JSON tree"
      tabIndex={0}
      onScroll={(e) =>
        setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })
      }
    >
      <div className="json-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
        <div className="json-window" style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
          {rows.slice(start, end).map((row, i) => (
            <JsonRow
              key={row.id}
              row={row}
              line={start + i + 1}
              selected={row.id === selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TreeView({ root, expanded, setExpanded, reveal, onReveal }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [scrollTo, setScrollTo] = useState(null);
  const rows = useMemo(() => buildRows(root, expanded), [root, expanded]);
  const revealed = useRef(null);

  // After a reveal the tree has been re-expanded; locate and scroll to the target row, once.
  useEffect(() => {
    if (!reveal || revealed.current === reveal) return;
    revealed.current = reveal;
    const index = rowIndexForPath(rows, reveal.path);
    if (index >= 0) {
      setSelectedId(rows[index].id);
      setScrollTo({ index });
    }
  }, [rows, reveal]);

  const toggle = useCallback(
    (id) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [setExpanded],
  );
  const select = useCallback((row) => setSelectedId(row.owner || row.id), []);

  function search(event) {
    event.preventDefault();
    if (!query.trim()) return setFound(null);
    setFound({ query: query.trim(), ...searchJson(root, query, 200) });
  }

  function expandAll() {
    const ids = allContainerIds(root);
    if (!ids)
      return toast.error('Too large to expand everything at once: expand a node or search.');
    setExpanded(new Set(ids));
  }

  const selectedPath = selectedId ? pathOfId(root, selectedId) : null;
  return (
    <>
      <div className="json-toolbar">
        <form className="json-search" onSubmit={search} role="search">
          <input
            aria-label="Search keys and values"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keys and values, then press Enter"
          />
          <button type="submit">Search</button>
        </form>
        <button type="button" onClick={expandAll}>
          Expand all
        </button>
        <button type="button" onClick={() => setExpanded(new Set([ROOT_ID]))}>
          Collapse all
        </button>
      </div>

      {found && (
        <div className="json-results" aria-label="Search results">
          <div className="json-results-head">
            <b>
              {found.total.toLocaleString()} match{found.total === 1 ? '' : 'es'} for “{found.query}
              ”
            </b>
            {found.total > found.results.length && (
              <small className="muted"> · showing the first {found.results.length}</small>
            )}
            <button type="button" className="link" onClick={() => setFound(null)}>
              Close
            </button>
          </div>
          <ol>
            {found.results.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => onReveal(r.path)}>
                  <code>{pathLabel(r.path)}</code>
                  <span className="muted">
                    {' '}
                    {r.match === 'key' ? 'key' : JSON.stringify(valueAt(root, r.path))}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <VirtualTree
        rows={rows}
        selectedId={selectedId}
        scrollTo={scrollTo}
        onToggle={toggle}
        onSelect={select}
      />

      <div className="json-statusbar" role="status">
        <span>{rows.length.toLocaleString()} lines shown</span>
        {selectedPath && (
          <>
            <code title={pathLabel(selectedPath)}>{pathLabel(selectedPath)}</code>
            <button type="button" onClick={() => cp(pathLabel(selectedPath), 'Copied path')}>
              Copy path
            </button>
            <button
              type="button"
              onClick={() =>
                cp(JSON.stringify(valueAt(root, selectedPath), null, 2), 'Copied value')
              }
            >
              Copy value
            </button>
          </>
        )}
      </div>
    </>
  );
}

function ApplicationsView({ doc, onShowInTree }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [app, setApp] = useState('');
  const [field, setField] = useState('');
  const total = useMemo(() => Object.keys(doc.apps).length, [doc]);
  const apps = useMemo(() => listApps(doc, deferred, 300), [doc, deferred]);
  const fieldHits = useMemo(() => searchFields(doc, deferred, 200), [doc, deferred]);
  const current = app ? doc.apps[app] : null;
  const fieldRow = useRef(null);

  useEffect(() => {
    fieldRow.current?.scrollIntoView?.({ block: 'center' });
  }, [app, field]);

  const open = (name, fieldName = '') => {
    setApp(name);
    setField(fieldName);
  };

  return (
    <div className="json-apps">
      <aside className="json-apps-list">
        <input
          aria-label="Search applications and fields"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Application or field name"
        />
        <small className="muted">
          {deferred.trim()
            ? `${apps.length === 300 ? '300+' : apps.length} application(s)`
            : `${total.toLocaleString()} applications${total > 300 ? ' · showing 300, type to filter' : ''}`}
        </small>
        <ul aria-label="Applications">
          {apps.map((name) => (
            <li key={name}>
              <button
                type="button"
                className={name === app ? 'on' : undefined}
                onClick={() => open(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
        {fieldHits.total > 0 && (
          <>
            <small className="muted">
              {fieldHits.total.toLocaleString()} field(s)
              {fieldHits.total > fieldHits.results.length ? ' · showing 200' : ''}
            </small>
            <ul aria-label="Fields">
              {fieldHits.results.map((hit) => (
                <li key={`${hit.app}|${hit.position}|${hit.name}`}>
                  <button type="button" onClick={() => open(hit.app, hit.name)}>
                    {hit.name}
                    <small className="muted"> · {hit.app}</small>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <section className="json-app-detail" aria-label="Application">
        {!current ? (
          <p className="muted">Choose an application, or search for a field name.</p>
        ) : (
          <>
            <div className="json-app-head">
              <div>
                <h2>{app}</h2>
                <p className="muted">
                  Prefix <code>{current.prefix || '—'}</code> · Record class{' '}
                  <code>{current.recordClass || '—'}</code> ·{' '}
                  {(current.fields?.length || 0).toLocaleString()} fields
                  {current.components?.length ? (
                    <>
                      {' '}
                      · Components <code>{current.components.join(', ')}</code>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="routine-creator-actions">
                <button type="button" onClick={() => onShowInTree(['apps', app], true)}>
                  Show in tree
                </button>
                <button
                  type="button"
                  onClick={() => cp(JSON.stringify(current, null, 2), `Copied ${app}`)}
                >
                  Copy JSON
                </button>
              </div>
            </div>
            <div className="json-table-wrap">
              <table className="json-table">
                <thead>
                  <tr>
                    {FIELD_COLUMNS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(current.fields || []).map((f, i) => (
                    <tr
                      key={i}
                      ref={f[1] === field ? fieldRow : undefined}
                      className={f[1] === field ? 'on' : undefined}
                    >
                      {FIELD_COLUMNS.map((c, j) => (
                        <td key={c} className={f[j] == null ? 'muted' : undefined}>
                          {f[j] == null ? '—' : String(f[j])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function JsonViewer() {
  const input = useRef(null);
  const fileInput = useRef(null);
  const parseToken = useRef(0);
  const typingTimer = useRef(0);
  const [doc, setDoc] = useState(null); // { value } so that a bare `null` document still shows
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [largeSource, setLargeSource] = useState('');
  const [expanded, setExpanded] = useState(() => new Set([ROOT_ID]));
  const [view, setView] = useState('tree');
  const [reveal, setReveal] = useState(null);
  const [source, setSource] = useState('paste'); // 'paste' | 'upload'
  const [uploads, setUploads] = useState([]); // [{ id, file }] for this session only
  const [activeUpload, setActiveUpload] = useState('');
  const [dragging, setDragging] = useState(false);
  const uploadSeq = useRef(0);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  const parse = useCallback(async (text, label, bytes = text.length) => {
    const token = ++parseToken.current;
    setBusy(`Parsing ${formatBytes(bytes)}…`);
    setError('');
    await nextFrame(); // let the status paint before the main thread is busy
    if (token !== parseToken.current) return;
    try {
      const t0 = performance.now();
      const value = JSON.parse(text);
      const parseMs = performance.now() - t0;
      const counts = stats(value);
      const knowledge = isKnowledgeFile(value) ? knowledgeSummary(value) : null;
      if (token !== parseToken.current) return;
      setDoc({ value });
      setExpanded(defaultExpanded(value, counts));
      setMeta({ label, bytes, ms: performance.now() - t0, parseMs, counts, knowledge });
      setReveal(null);
      setView('tree');
    } catch (e) {
      if (token !== parseToken.current) return;
      setError(`${label}: ${e.message}${errorLocation(e.message, text)}`);
    } finally {
      if (token === parseToken.current) setBusy('');
    }
  }, []);

  function clear() {
    parseToken.current++;
    clearTimeout(typingTimer.current);
    if (input.current) input.current.value = '';
    setDoc(null);
    setMeta(null);
    setError('');
    setBusy('');
    setLargeSource('');
    setActiveUpload('');
  }

  async function openFile(file) {
    if (!file) return;
    clearTimeout(typingTimer.current);
    setBusy(`Reading ${file.name}…`);
    const text = await file.text();
    if (input.current) input.current.value = file.size <= LARGE_TEXT ? text : '';
    setLargeSource(file.size <= LARGE_TEXT ? '' : `${file.name} · ${formatBytes(file.size)}`);
    await parse(text, file.name, file.size);
  }

  /** Adds files to the session's upload list and shows the first one. Only File handles are kept;
   * switching files re-reads and re-parses, so two 20 MB trees are never held at once. */
  function upload(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const added = files.map((file) => ({ id: `u${++uploadSeq.current}`, file }));
    setUploads((current) => [...current, ...added]);
    setSource('upload');
    showUpload(added[0]);
  }

  function showUpload(entry) {
    setActiveUpload(entry.id);
    openFile(entry.file);
  }

  /** Opens a release's fields.json as published with this site (see src/build/knowledgeFiles.js). */
  async function loadSite(release) {
    const label = `fields.json ${release} (this site)`;
    clearTimeout(typingTimer.current);
    setBusy(`Loading ${release} from this site…`);
    setError('');
    try {
      const res = await fetch(siteKnowledgeUrl(release));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (input.current) input.current.value = '';
      setActiveUpload('');
      setLargeSource(`${label} · ${formatBytes(text.length)}`);
      await parse(text, label);
    } catch (e) {
      setBusy('');
      setError(`${label}: ${e.message}`);
    }
  }

  function removeUpload(id) {
    setUploads((current) => current.filter((u) => u.id !== id));
    if (id === activeUpload) clear();
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
      upload(e.dataTransfer.files);
    },
  };

  function onPaste(event) {
    const text = event.clipboardData?.getData('text') || '';
    if (text.length <= LARGE_TEXT) return; // the change handler parses it
    event.preventDefault();
    clearTimeout(typingTimer.current);
    event.currentTarget.value = '';
    setLargeSource(`Pasted JSON · ${formatBytes(text.length)}`);
    parse(text, 'Pasted JSON');
  }

  function onChange(event) {
    const text = event.target.value;
    setLargeSource('');
    clearTimeout(typingTimer.current);
    if (!text.trim()) return clear();
    typingTimer.current = setTimeout(() => parse(text, 'Pasted JSON'), TYPING_DELAY);
  }

  function showInTree(path, openTarget = false) {
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of ancestorIds(path)) next.add(id);
      if (openTarget) next.add(idOfPath(path));
      return next;
    });
    setReveal({ path });
    setView('tree');
  }

  const downloadName = meta
    ? meta.label.replace(/\.json$/i, '').replace(/[^\w.-]+/g, '-') + '.formatted.json'
    : 'formatted.json';

  return (
    <div className="routine-creator json-viewer">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">Application Viewer</span>
          <h1>Read any JSON, even a 20 MB knowledge file</h1>
          <p className="muted">
            Paste JSON, upload a file or load a release published with this site to see it
            formatted, folded and searchable. A T24 <code>fields.json</code> knowledge file also
            gets an applications index. Everything stays in this browser.
          </p>
        </div>
      </div>

      <section className="routine-card json-source" aria-label="Input">
        <div className="json-source-bar">
          <div className="tabs json-source-tabs" role="tablist" aria-label="Input method">
            <button
              role="tab"
              aria-selected={source === 'paste'}
              className={source === 'paste' ? 'active' : undefined}
              onClick={() => setSource('paste')}
            >
              Paste JSON
            </button>
            <button
              role="tab"
              aria-selected={source === 'upload'}
              className={source === 'upload' ? 'active' : undefined}
              onClick={() => setSource('upload')}
            >
              Upload file{uploads.length ? ` (${uploads.length})` : ''}
            </button>
          </div>
          <div className="json-site-load">
            {SITE_RELEASES.map((release) => (
              <button
                key={release}
                type="button"
                disabled={busy !== ''}
                onClick={() => loadSite(release)}
              >
                Load {release} from this site
              </button>
            ))}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json,text/plain"
          multiple
          hidden
          aria-label="JSON file"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="json-drop" hidden={source !== 'paste'} {...dropProps}>
          <textarea
            ref={input}
            aria-label="JSON source"
            className={`json-input${largeSource ? ' compact' : ''}${dragging ? ' dragging' : ''}`}
            spellCheck={false}
            onPaste={onPaste}
            onChange={onChange}
            placeholder={
              largeSource
                ? `${largeSource} — shown below. Paste or type to replace it.`
                : 'Paste JSON here, or drop a .json file…'
            }
          />
        </div>
        {source === 'upload' && (
          <div className="json-upload">
            <div className={`json-dropzone${dragging ? ' dragging' : ''}`} {...dropProps}>
              <span className="json-dropzone-icon" aria-hidden="true">
                ⇪
              </span>
              <b>Drop .json files here</b>
              <span className="muted">or</span>
              <button type="button" className="primary" onClick={() => fileInput.current?.click()}>
                Choose files…
              </button>
              <small className="muted">
                Several files at once are fine (for example R23 and R25 <code>fields.json</code>); a
                20 MB file opens in about a second. Files are read in this browser only and never
                sent to a server.
              </small>
            </div>
            {uploads.length > 0 && (
              <ul className="json-uploads" aria-label="Uploaded files">
                {uploads.map((u) => (
                  <li key={u.id} className={u.id === activeUpload ? 'on' : undefined}>
                    <button
                      type="button"
                      className="json-upload-open"
                      aria-current={u.id === activeUpload ? 'true' : undefined}
                      onClick={() => showUpload(u)}
                    >
                      <b>{u.file.name}</b>
                      <small className="muted">{formatBytes(u.file.size)}</small>
                    </button>
                    <button
                      type="button"
                      className="json-upload-remove"
                      aria-label={`Remove ${u.file.name}`}
                      onClick={() => removeUpload(u.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="json-source-actions">
          <div className="json-meta" role="status">
            {busy ? (
              <span className="json-busy">{busy}</span>
            ) : meta ? (
              <>
                <b>{meta.label}</b>
                <span>{formatBytes(meta.bytes)}</span>
                <span>parsed in {Math.round(meta.ms).toLocaleString()} ms</span>
                <span>
                  {(meta.counts.objects + meta.counts.arrays).toLocaleString()} containers ·{' '}
                  {meta.counts.values.toLocaleString()} values · depth {meta.counts.maxDepth}
                </span>
                {meta.knowledge && (
                  <span className="json-tag">
                    T24 knowledge {meta.knowledge.release} ·{' '}
                    {meta.knowledge.appCount.toLocaleString()} apps ·{' '}
                    {meta.knowledge.fieldCount.toLocaleString()} fields
                  </span>
                )}
              </>
            ) : (
              <span className="muted">Nothing loaded yet.</span>
            )}
          </div>
          <div className="routine-creator-actions">
            <button type="button" onClick={() => fileInput.current?.click()}>
              Upload file…
            </button>
            <button
              type="button"
              disabled={!doc}
              onClick={() => cp(JSON.stringify(doc.value, null, 2), 'Copied formatted JSON')}
            >
              Copy formatted
            </button>
            <button
              type="button"
              disabled={!doc}
              onClick={() =>
                dl(downloadName, JSON.stringify(doc.value, null, 2), 'application/json')
              }
            >
              Download formatted
            </button>
            <button type="button" onClick={clear}>
              Clear
            </button>
          </div>
        </div>
        {error && (
          <p className="routine-validation invalid" role="alert">
            {error}
          </p>
        )}
      </section>

      {doc && (
        <section className="routine-card json-output" aria-label="Formatted JSON">
          {meta?.knowledge && (
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
                aria-selected={view === 'apps'}
                className={view === 'apps' ? 'active' : undefined}
                onClick={() => setView('apps')}
              >
                T24 applications
              </button>
            </div>
          )}
          {view === 'apps' && meta?.knowledge ? (
            <ApplicationsView doc={doc.value} onShowInTree={showInTree} />
          ) : (
            <TreeView
              root={doc.value}
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
