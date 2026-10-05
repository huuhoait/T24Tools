import { useEffect, useRef, useState } from 'react';
import { ChoiceList } from '../features/artefactGenerator/pickers';
import { knowledgeStore, siteKnowledgeUrl } from '../lib/knowledge';
import { SITE_RELEASES } from '../lib/siteKnowledge';
import { toast } from '../lib/toast';

/**
 * Release choice and knowledge-file loading, shared by the Artefact Generator and the Routine
 * Builder. A file comes from disk or, in one click, from the releases published with the site.
 */
export function KnowledgePanel({ release, knowledge, onRelease }) {
  const [releases, setReleases] = useState([]);
  const [load, setLoad] = useState({ busy: '', error: '' });
  const fileInput = useRef(null);

  useEffect(() => {
    let live = true;
    const refresh = () =>
      knowledgeStore.listReleases().then((list) => {
        if (live) setReleases(list);
      });
    refresh();
    const stop = knowledgeStore.subscribe(refresh);
    return () => {
      live = false;
      stop();
    };
  }, []);

  // With exactly one release loaded there is nothing to choose.
  useEffect(() => {
    if (!release && releases.length === 1) onRelease(releases[0]);
  }, [release, releases, onRelease]);

  async function run(busy, source, task) {
    setLoad({ busy, error: '' });
    try {
      const loaded = await task();
      setLoad({ busy: '', error: '' });
      onRelease(loaded.release);
      toast.success(
        `Loaded ${loaded.release}: ${loaded.appCount.toLocaleString()} applications, ${loaded.fieldCount.toLocaleString()} fields` +
          (loaded.persisted ? '' : ' (this browser blocks storage: it will not be remembered)'),
      );
    } catch (e) {
      // Kept on screen (a toast alone disappears before a large file's error is noticed).
      setLoad({ busy: '', error: `${source}: ${e.message}` });
      toast.error(e.message);
    }
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await run('file', file.name, async () => knowledgeStore.loadText(await file.text()));
  }

  return (
    <>
      {releases.length ? (
        <ChoiceList
          name="Release"
          options={releases.map((r) => ({ id: r, label: r }))}
          value={release}
          onChange={onRelease}
        />
      ) : (
        <p className="muted">No knowledge file loaded yet.</p>
      )}
      <div className="routine-creator-actions">
        <button
          type="button"
          disabled={Boolean(load.busy)}
          onClick={() => fileInput.current?.click()}
        >
          {load.busy === 'file' ? 'Reading knowledge file…' : 'Load knowledge file…'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={loadFile}
          aria-label="Knowledge file"
        />
        {SITE_RELEASES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={Boolean(load.busy)}
            onClick={() =>
              run(r, `${r} from this site`, () => knowledgeStore.loadUrl(siteKnowledgeUrl(r)))
            }
          >
            {load.busy === r ? `Downloading ${r}…` : `Load ${r} from this site`}
          </button>
        ))}
        <small className="muted">
          A <code>fields.json</code> from disk (one per release), or the published R23 / R25 file
          (about 18 MB). It is kept only in this browser and shared by every tool.
        </small>
      </div>
      {load.error && (
        <p className="routine-validation" role="alert">
          {load.error}
        </p>
      )}
      {knowledge && (
        <p className="muted">
          {knowledge.release}: {knowledge.appCount?.toLocaleString()} applications ·{' '}
          {knowledge.fieldCount?.toLocaleString()} fields
        </p>
      )}
    </>
  );
}
