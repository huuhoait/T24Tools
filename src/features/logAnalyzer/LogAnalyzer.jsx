import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { cp } from '../../lib/text';
import { toast } from '../../lib/toast';
import { OFS_HANDOFF_KEY, handoffFromOfs } from '../ofsGenerator/ofsMessage';
import { OFS_HEADER_FIELDS, entryAsText, formatXml, matchesFilter, parseLog } from './logParser';

// Entries rendered per source before "Show more"; logs often run to tens of thousands of lines.
const PAGE = 200;
const LEVEL_ORDER = ['ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG', 'TRACE'];
const PASTED_ID = 'pasted';

// `level-*`, not `error`: the shell already styles a global `.error` banner.
function levelClass(entry) {
  if (entry.error) return 'level-error';
  if (entry.level.startsWith('WARN') || entry.warnings.length) return 'level-warn';
  return entry.level ? 'level-info' : 'level-raw';
}

const countLabel = (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

function EntryRow({ entry, onOpen }) {
  const text = entry.message.trim();
  return (
    <li>
      <button
        type="button"
        className={'log-entry ' + levelClass(entry)}
        onClick={() => onOpen(entry)}
      >
        <span className="log-entry-meta">
          <span className="log-level">{entry.level || 'LINE'}</span>
          {entry.parsed ? (
            <>
              <span>{entry.timestamp.slice(11)}</span>
              <span className="log-module">{entry.module}</span>
            </>
          ) : (
            <span>line {entry.line}</span>
          )}
          {entry.ofs && <span className="log-tag">OFS</span>}
          {entry.warnings.length > 0 && <span className="log-tag warn">Warnings</span>}
          {entry.xml.length > 0 && <span className="log-tag">XML</span>}
        </span>
        <span className="log-entry-text">
          {text ? (text.length > 220 ? text.slice(0, 220) + '…' : text) : 'Open for details'}
        </span>
      </button>
    </li>
  );
}

function SourceColumn({ source, entries, onOpen }) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <section className="log-column" aria-label={source.name}>
      <div className="log-column-head">
        <b title={source.name}>{source.name}</b>
        <small className="muted">
          {entries.length === source.total
            ? countLabel(source.total)
            : `${entries.length} of ${source.total}`}
        </small>
      </div>
      {entries.length === 0 ? (
        <p className="muted log-column-empty">No entries match.</p>
      ) : (
        <ol className="log-entries">
          {entries.slice(0, limit).map((entry) => (
            <EntryRow key={entry.line} entry={entry} onOpen={(e) => onOpen(e, source.name)} />
          ))}
        </ol>
      )}
      {entries.length > limit && (
        <button type="button" className="log-more" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, entries.length - limit)} more
        </button>
      )}
    </section>
  );
}

function CodeBlock({ label, text }) {
  return (
    <details className="log-block">
      <summary>{label}</summary>
      <div className="log-block-body">
        <button type="button" onClick={() => cp(text, label + ' copied')}>
          Copy
        </button>
        <pre>{text}</pre>
      </div>
    </details>
  );
}

function OfsDetail({ ofs, onOpenOfs }) {
  const d = ofs.data;
  if (!d)
    return (
      <section className="log-ofs">
        <h3>OFS application</h3>
        <p className="muted">This OFS message is not valid XML. The raw message is below.</p>
        <CodeBlock label="Raw OFS XML" text={ofs.rawXml} />
      </section>
    );
  return (
    <section className="log-ofs">
      <div className="log-ofs-head">
        <h3>OFS application</h3>
        {d.application && (
          <button type="button" className="primary" onClick={onOpenOfs}>
            Open in OFS Generator
          </button>
        )}
      </div>
      <dl className="log-facts">
        {OFS_HEADER_FIELDS.filter((k) => d[k]).map((k) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{d[k]}</dd>
          </div>
        ))}
      </dl>
      {d.fields.length > 0 && (
        <div className="json-table-wrap">
          <table className="json-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>MV.SV</th>
                <th>Value</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {d.fields.map((f, i) => (
                <tr key={i}>
                  <td>{f.fieldName}</td>
                  <td>
                    {f.multiValueNumber}
                    {f.subValueNumber && '.' + f.subValueNumber}
                  </td>
                  <td>{f.value}</td>
                  <td>{f.displayType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CodeBlock label="Raw OFS XML" text={formatXml(ofs.rawXml)} />
    </section>
  );
}

function EntryDialog({ selected, onClose, onOpenOfs }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
    if (!selected && dialog?.open) dialog.close();
  }, [selected]);
  const entry = selected?.entry;
  return (
    <dialog
      ref={ref}
      className="log-dialog"
      aria-labelledby="log-dialog-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {entry && (
        <div className="log-dialog-body">
          <div className="log-dialog-head">
            <div>
              <span className="eyebrow">
                {selected.sourceName} · line {entry.line}
              </span>
              <h2 id="log-dialog-title">
                <span className={'log-level ' + levelClass(entry)}>{entry.level || 'LINE'}</span>{' '}
                {entry.module || 'Unparsed line'}
              </h2>
            </div>
            <div className="log-dialog-actions">
              <button
                type="button"
                onClick={() => cp(entryAsText(entry, selected.sourceName), 'Entry copied')}
              >
                Copy details
              </button>
              <button type="button" aria-label="Close" onClick={onClose}>
                ✕
              </button>
            </div>
          </div>
          {entry.parsed && (
            <dl className="log-facts">
              {[
                ['Timestamp', entry.timestamp],
                ['Thread', entry.thread],
                ['Session', entry.session],
                ['User', entry.user],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {entry.warnings.length > 0 && (
            <div className="log-warnings" role="note">
              <b>Warnings</b>
              <ul>
                {entry.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.message.trim() && <pre className="log-message">{entry.message.trim()}</pre>}
          {entry.ofs && <OfsDetail ofs={entry.ofs} onOpenOfs={() => onOpenOfs(entry)} />}
          {entry.xml.map((xml, i) => (
            <CodeBlock key={i} label={`XML message ${i + 1}`} text={formatXml(xml)} />
          ))}
          <CodeBlock label="Raw log line" text={entry.raw} />
        </div>
      )}
    </dialog>
  );
}

export function LogAnalyzer({ onOpenTool }) {
  const fileInput = useRef(null);
  const seq = useRef(0);
  const [files, setFiles] = useState([]); // [{ id, name, total, entries }] for this session only
  const [pasted, setPasted] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [selected, setSelected] = useState(null); // { entry, sourceName }
  const [dragging, setDragging] = useState(false);

  const deferredPasted = useDeferredValue(pasted);
  const deferredQuery = useDeferredValue(query.trim());
  const pastedEntries = useMemo(() => parseLog(deferredPasted), [deferredPasted]);

  const sources = useMemo(() => {
    const all = [...files];
    if (pastedEntries.length)
      all.push({
        id: PASTED_ID,
        name: 'Pasted content',
        total: pastedEntries.length,
        entries: pastedEntries,
      });
    return all;
  }, [files, pastedEntries]);

  const levels = useMemo(() => {
    const found = new Set();
    let ofs = false;
    for (const s of sources)
      for (const e of s.entries) {
        if (e.level) found.add(e.level);
        if (e.ofs) ofs = true;
      }
    const rank = (l) => (LEVEL_ORDER.includes(l) ? LEVEL_ORDER.indexOf(l) : LEVEL_ORDER.length);
    const list = [...found].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return ofs ? [...list, 'OFS'] : list;
  }, [sources]);

  const filtered = useMemo(
    () =>
      sources.map((s) => ({
        source: s,
        entries: s.entries.filter((e) => matchesFilter(e, deferredQuery, level)),
      })),
    [sources, deferredQuery, level],
  );
  const total = sources.reduce((n, s) => n + s.total, 0);
  const shown = filtered.reduce((n, f) => n + f.entries.length, 0);

  async function add(list) {
    const picked = [...(list || [])];
    if (!picked.length) return;
    try {
      const read = await Promise.all(
        picked.map(async (file) => {
          const entries = parseLog(await file.text());
          return { id: `f${++seq.current}`, name: file.name, total: entries.length, entries };
        }),
      );
      setFiles((cur) => [...cur, ...read]);
      const count = read.reduce((n, f) => n + f.total, 0);
      toast.success(
        `Read ${countLabel(count)} from ${read.length} file${read.length > 1 ? 's' : ''}`,
      );
    } catch (e) {
      toast.error('Could not read the file: ' + (e?.message || 'unknown error'));
    }
  }

  function clearAll() {
    setFiles([]);
    setPasted('');
    setQuery('');
    setLevel('');
    setSelected(null);
  }

  function openInOfs(entry) {
    try {
      localStorage.setItem(
        OFS_HANDOFF_KEY,
        JSON.stringify(handoffFromOfs(entry.ofs.data, entry.ofs.rawXml)),
      );
    } catch {
      toast.error('Could not hand the message over: browser storage is blocked');
      return;
    }
    setSelected(null);
    onOpenTool?.('ofs');
  }

  const drop = {
    onDragOver: (e) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      add(e.dataTransfer.files);
    },
  };

  return (
    <div className="routine-creator log-analyzer">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">T24 Log Analyzer</span>
          <h1>Read T24 and TAFJ logs side by side</h1>
          <p>
            Open one or more log files, or paste log lines. Filter every source at once, open an
            entry for its OFS fields and XML, and send an OFS message to the OFS Message Generator.
            Logs never leave this browser.
          </p>
        </div>
        {sources.length > 0 && (
          <div className="routine-creator-actions">
            <button type="button" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}
      </div>

      <section className="routine-card log-intake" aria-label="Log sources">
        <div className="log-intake-grid">
          <div className={'json-dropzone' + (dragging ? ' dragging' : '')} {...drop}>
            <span className="json-dropzone-icon" aria-hidden="true">
              ⇪
            </span>
            <button type="button" className="primary" onClick={() => fileInput.current?.click()}>
              Open log files…
            </button>
            <small className="muted">
              or drop .log / .txt files here. Add as many as you need.
            </small>
            <input
              ref={fileInput}
              type="file"
              accept=".log,.txt,text/plain"
              multiple
              hidden
              aria-label="Log files"
              onChange={(e) => {
                add(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <label className="log-paste">
            <span>Paste log content</span>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="[INFO ]20260901 10:15:30.1234 42 [S1] [INPUTTER] [OFS.MODULE] …"
              spellCheck={false}
            />
          </label>
        </div>
        {files.length > 0 && (
          <ul className="json-uploads" aria-label="Log files">
            {files.map((f) => (
              <li key={f.id}>
                <span className="json-upload-open log-file">
                  <b>{f.name}</b>
                  <small className="muted">{countLabel(f.total)}</small>
                </span>
                <button
                  type="button"
                  className="json-upload-remove"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sources.length > 0 && (
        <>
          <div className="log-toolbar">
            <input
              type="search"
              aria-label="Filter entries"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by text, user, module, field, transaction ID…"
            />
            <div className="tabs" role="group" aria-label="Level">
              {['', ...levels].map((l) => (
                <button
                  key={l || 'all'}
                  type="button"
                  aria-pressed={level === l}
                  className={level === l ? 'active' : undefined}
                  onClick={() => setLevel(l)}
                >
                  {l || 'All'}
                </button>
              ))}
            </div>
            <small className="muted" aria-live="polite">
              {shown === total ? countLabel(total) : `${shown} of ${countLabel(total)}`}
            </small>
          </div>
          <div className="log-columns">
            {filtered.map(({ source, entries }) => (
              <SourceColumn
                key={source.id + '|' + deferredQuery + '|' + level}
                source={source}
                entries={entries}
                onOpen={(entry, sourceName) => setSelected({ entry, sourceName })}
              />
            ))}
          </div>
        </>
      )}

      <EntryDialog selected={selected} onClose={() => setSelected(null)} onOpenOfs={openInOfs} />
    </div>
  );
}
