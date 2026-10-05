import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown } from '../../lib/markdown';
import { renderMermaidBlocks } from '../../services/diagram';

// RepoMind's Markdown viewer (paste, sanitised, mermaid) with MDFV's file upload and manuscript sheet.
export function MarkdownViewer() {
  const fileInput = useRef(null);
  const sheet = useRef(null);
  const seq = useRef(0);
  const [pasted, setPasted] = useState('');
  const [files, setFiles] = useState([]); // [{ id, name, text }] for this session only
  const [active, setActive] = useState(''); // '' = pasted text, else a file id
  const [diagramError, setDiagramError] = useState('');
  const [dragging, setDragging] = useState(false);

  const current = files.find((f) => f.id === active);
  const text = current ? current.text : pasted;
  const html = useMemo(() => renderMarkdown(text), [text]);

  useEffect(() => {
    let live = true;
    renderMermaidBlocks(sheet.current)
      .then(() => live && setDiagramError(''))
      .catch((e) => live && setDiagramError(e.message));
    return () => {
      live = false;
    };
  }, [html]);

  async function add(list) {
    const picked = [...(list || [])];
    if (!picked.length) return;
    const read = await Promise.all(
      picked.map(async (file) => ({
        id: `m${++seq.current}`,
        name: file.name,
        text: await file.text(),
      })),
    );
    setFiles((cur) => [...cur, ...read]);
    setActive(read[0].id);
  }

  function remove(id) {
    setFiles((cur) => cur.filter((f) => f.id !== id));
    if (id === active) setActive('');
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
    <div className="routine-creator md-viewer-tool">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">Markdown Viewer</span>
          <h1>Read Markdown, including Mermaid diagrams</h1>
          <p className="muted">
            Paste Markdown or open <code>.md</code> files. Everything stays in this browser.
          </p>
        </div>
      </div>

      <section
        className={`routine-card md-intake${dragging ? ' dragging' : ''}`}
        aria-label="Input"
        {...drop}
      >
        <textarea
          aria-label="Markdown source"
          className="md-input"
          spellCheck={false}
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            setActive('');
          }}
          placeholder="Paste Markdown here, or drop .md files…"
        />
        <div className="routine-creator-actions">
          <button type="button" className="primary" onClick={() => fileInput.current?.click()}>
            Open .md files…
          </button>
          <button
            type="button"
            onClick={() => {
              setPasted('');
              setActive('');
            }}
          >
            Clear
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            multiple
            hidden
            aria-label="Markdown file"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {files.length > 0 && (
          <ul className="json-uploads" aria-label="Markdown files">
            {files.map((f) => (
              <li key={f.id} className={f.id === active ? 'on' : undefined}>
                <button
                  type="button"
                  className="json-upload-open"
                  aria-current={f.id === active ? 'true' : undefined}
                  onClick={() => setActive(f.id)}
                >
                  <b>{f.name}</b>
                </button>
                <button
                  type="button"
                  className="json-upload-remove"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => remove(f.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {diagramError && (
        <p className="routine-validation" role="alert">
          {diagramError}
        </p>
      )}
      {text.trim() && (
        <div className="md-frame">
          <span className="md-tab">{current ? current.name : 'pasted.md'}</span>
          <article
            ref={sheet}
            className="md-sheet"
            aria-label="Rendered markdown"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
}
