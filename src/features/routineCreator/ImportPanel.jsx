import { useMemo, useRef, useState } from 'react';
import { cp, dl } from '../../lib/text';
import { toast } from '../../lib/toast';
import { parseRoutine, routineFileError } from './routineImport';
import { renameRoutine, validateNewName } from './routineRename';

/** The "Open existing routine" button. Files are read in the browser and never uploaded. */
export function OpenRoutineButton({ onOpen }) {
  const input = useRef(null);

  async function open(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const error = routineFileError(text, file.size);
      if (error) {
        toast.error(error);
        return;
      }
      onOpen({ fileName: file.name, source: text, result: parseRoutine(text, file.name) });
    } catch (e) {
      toast.error('Could not read ' + file.name + ': ' + (e?.message || 'unknown error'));
    }
  }

  return (
    <>
      <button onClick={() => input.current?.click()}>📂 Open existing routine</button>
      <input
        ref={input}
        type="file"
        aria-label="Open existing routine"
        accept=".b,.txt,text/plain,*"
        hidden
        onChange={open}
      />
    </>
  );
}

/** What was read from the routine, what was not, and the Creator / Copy mode switch. */
export function ImportReport({ imported, mode, setMode, onClose }) {
  const { fileName, result } = imported;
  return (
    <section className="routine-card routine-import" aria-label="Imported routine">
      <div className="routine-card-title">
        <div>
          <h2>Imported {fileName}</h2>
          <small>
            Read in this browser only.{' '}
            {result.kind ? result.kind + ' ' + result.name : 'No routine header found.'}
          </small>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="tabs" role="tablist" aria-label="Imported routine mode">
        <button
          role="tab"
          aria-selected={mode === 'create'}
          className={mode === 'create' ? 'active' : ''}
          onClick={() => setMode('create')}
        >
          Edit in creator
        </button>
        <button
          role="tab"
          aria-selected={mode === 'copy'}
          className={mode === 'copy' ? 'active' : ''}
          onClick={() => setMode('copy')}
        >
          Copy with new name
        </button>
      </div>
      {mode === 'create' && (
        <div className="routine-import-lists">
          <div>
            <b>Mapped into the creator</b>
            {result.mapped.length ? (
              <ul aria-label="Mapped">
                {result.mapped.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing could be mapped.</p>
            )}
          </div>
          <div>
            <b>Not mapped</b>
            {result.unmapped.length ? (
              <ul aria-label="Not mapped">
                {result.unmapped.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Everything found was mapped.</p>
            )}
            <p className="muted">
              The creator regenerates INIT and PROCESS from its settings; the rest of the routine is
              not carried over. Use <b>Copy with new name</b> to keep the routine as it is.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/** Keeps the uploaded source as it is and renames only the routine itself. */
export function CopyWithNewName({ imported }) {
  const oldName = imported.result.kind ? imported.result.name : '';
  const [newName, setNewName] = useState(oldName);
  const name = newName.trim();
  const error = oldName
    ? validateNewName(name, oldName)
    : 'The file has no SUBROUTINE, PROGRAM or FUNCTION header to rename.';
  const renamed = useMemo(
    () => (error ? null : renameRoutine(imported.source, oldName, name)),
    [error, imported.source, oldName, name],
  );

  return (
    <div className="routine-creator-grid routine-copy">
      <section className="routine-card">
        <div className="routine-card-title">
          <div>
            <h2>Copy with new name</h2>
            <small>
              Only {oldName || 'the routine'} itself is renamed: its header and its own name in
              comments, strings and calls to itself. Calls to other routines stay as they are.
            </small>
          </div>
        </div>
        <div className="routine-form-grid">
          <label className="wide">
            New routine name
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="NEW.ROUTINE"
              spellCheck={false}
            />
          </label>
        </div>
        {error ? (
          <p className="routine-validation invalid" role="status">
            {error}
          </p>
        ) : (
          <div className="routine-diff" aria-label="Changes">
            <b>
              {renamed.changes.length} changed line{renamed.changes.length === 1 ? '' : 's'}
            </b>
            {renamed.changes.map((change) => (
              <div className="routine-diff-change" key={change.line}>
                <span className="routine-diff-line">Line {change.line}</span>
                <pre className="routine-diff-before">- {change.before}</pre>
                <pre className="routine-diff-after">+ {change.after}</pre>
              </div>
            ))}
          </div>
        )}
      </section>
      <aside className="routine-preview-card">
        <div className="routine-preview-head">
          <div>
            <span className="eyebrow">Preview</span>
            <h2>{error ? imported.fileName : name + '.b'}</h2>
          </div>
          <div className="routine-creator-actions">
            <button
              className="primary"
              disabled={!renamed}
              onClick={() => cp(renamed.text, 'Renamed routine copied to clipboard')}
            >
              📋 Copy
            </button>
            <button disabled={!renamed} onClick={() => dl(name + '.b', renamed.text)}>
              ⬇ Download
            </button>
          </div>
        </div>
        <textarea
          className="routine-output"
          aria-label="Renamed routine"
          value={renamed ? renamed.text : imported.source}
          readOnly
          spellCheck={false}
        />
      </aside>
    </div>
  );
}
