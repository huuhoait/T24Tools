import './styles.css';
import { Suspense, lazy, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/Toaster';
import { NAV_TABS, initialTab } from './navigation';
import { applyTheme, loadTheme, nextTheme, saveTheme } from './lib/theme';

const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
const THEME_ICONS = { system: '🖥', light: '☀', dark: '☾' };

// Tools are loaded on first use so the initial bundle only carries the shell.
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const RoutineCreator = named(
  () => import('./features/routineCreator/RoutineCreator'),
  'RoutineCreator',
);
const RoutineBuilder = named(
  () => import('./features/routineBuilder/RoutineBuilder'),
  'RoutineBuilder',
);
const ArtefactGenerator = named(
  () => import('./features/artefactGenerator/ArtefactGenerator'),
  'ArtefactGenerator',
);
const JsonViewer = named(() => import('./features/jsonViewer/JsonViewer'), 'JsonViewer');
const OFSGenerator = named(() => import('./features/tools/EmbeddedTools'), 'OFSGenerator');
const LogAnalyzer = named(() => import('./features/tools/EmbeddedTools'), 'LogAnalyzer');

function App() {
  const [theme, setTheme] = useState(loadTheme);
  const [tab, setTab] = useState(initialTab);
  // The Routine Creator and Routine Builder stay mounted once opened, so an imported routine
  // survives a tab switch. The embedded tools are remounted on every visit: the OFS Generator
  // reads a Log Analyzer handoff when its frame starts, exactly as it did in RepoMind.
  const [routineMounted, setRoutineMounted] = useState(tab === 'routine');
  if (tab === 'routine' && !routineMounted) setRoutineMounted(true);
  const [builderMounted, setBuilderMounted] = useState(tab === 'builder');
  if (tab === 'builder' && !builderMounted) setBuilderMounted(true);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ◈
          </div>
          <div>
            <b>T24Tools</b>
            <small>Temenos T24 developer tools in your browser</small>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={() => {
              const next = nextTheme(theme);
              setTheme(next);
              saveTheme(next);
              applyTheme(next);
            }}
            title={`Theme: ${THEME_LABELS[theme]} (click for ${THEME_LABELS[nextTheme(theme)]})`}
            aria-label={`Theme: ${THEME_LABELS[theme]}`}
          >
            <span aria-hidden="true">{THEME_ICONS[theme]}</span> {THEME_LABELS[theme]}
          </button>
        </div>
      </header>
      <nav className="workspace-nav" aria-label="Tools">
        <div className="nav-group">
          <span>T24</span>
          {NAV_TABS.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? 'active' : undefined}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<p className="muted loading">Loading tool…</p>}>
          {routineMounted && (
            <div hidden={tab !== 'routine'}>
              <ErrorBoundary>
                <RoutineCreator />
              </ErrorBoundary>
            </div>
          )}
          {builderMounted && (
            <div hidden={tab !== 'builder'}>
              <ErrorBoundary>
                <RoutineBuilder />
              </ErrorBoundary>
            </div>
          )}
          {tab !== 'routine' && tab !== 'builder' && (
            <ErrorBoundary key={tab}>
              {tab === 'artefact' && <ArtefactGenerator />}
              {tab === 'ofs' && <OFSGenerator />}
              {tab === 'log' && <LogAnalyzer onOpenTool={setTab} />}
              {tab === 'json' && <JsonViewer />}
            </ErrorBoundary>
          )}
        </Suspense>
      </main>
      <footer>
        © {new Date().getFullYear()} T24Tools · Zain Kamali · Independent project, not affiliated
        with or endorsed by Temenos. Temenos, T24 and Transact are trademarks of Temenos AG.
      </footer>
      <Toaster />
    </>
  );
}

export default App;
