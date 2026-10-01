# T24Tools Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move RepoMind's three T24 tools (Routine Creator, OFS Message Generator, T24 Log Analyzer) into a standalone T24Tools app, add "Open existing routine" and "Copy with new name" to the Routine Creator, then remove the Routine Creator from RepoMind.

**Architecture:** A React 19 + Vite single-page app with three header tabs. The Routine Creator is a React feature, moved file-for-file from RepoMind. The OFS Generator and the Log Analyzer stay self-contained HTML pages in `public/tools/`, run in opaque-origin sandboxed iframes, and reach storage through a postMessage bridge (`t24tools-bridge.js` ↔ `EmbeddedTools.jsx`). Import and rename are pure functions (`routineImport.js`, `routineRename.js`), covered by unit tests; the UI only calls them.

**Tech Stack:** React 19, Vite 8, Vitest 5, Playwright 1.63, ESLint 9, Prettier 3, Node 22 (CI), GitHub Pages.

**Spec:** The user's request in the session of 2026-10-01 (Steps 1 and 2 plus the working notes). The sections below restate it.

## Global Constraints

- T24Tools lives at `D:\Zain\Projects\T24Tools`, never inside RepoMind; remote `https://github.com/zainknoman/T24Tools.git`, branch `main`.
- Same tooling as RepoMind: Prettier (`singleQuote`, `printWidth 100`, `trailingComma all`), ESLint flat config, Vitest, Playwright against the production preview, `npm run check` = format:check + lint + test + build.
- CI and Pages workflows use Node 22. Pages base path is `/T24Tools/`.
- The look matches RepoMind: header, theme tokens, System/Light/Dark toggle and the tools' own styling.
- `repomind` identifiers become `t24tools` (bridge file, global, message types, storage keys, theme key). The legacy `repomind.*` keys are read once as a fallback.
- Log Analyzer → OFS Generator handoff behaves as before: storage-set of the context key, then `open-tool` with `ofs`, then the OFS iframe mounts fresh and loads the context.
- Routine import never invents field positions; anything it cannot map is reported.
- Everything stays in the browser; no network calls (CSP `connect-src 'self'`).
- RepoMind keeps all Temenos analysis code (temenosBasic.js, temenos.js, temenosRecords.js, analyzers, configuration records, T24 AI ranking).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No inline shell heredocs containing regexes or `\n`; use editor tools.

## Review Focus

1. **The uploaded file is not a routine** (binary, empty, or no SUBROUTINE/PROGRAM/FUNCTION header). Expected: a clear message; the creator is not populated with nonsense. Tests: `parseRoutine('')` and a header-less source report `No SUBROUTINE, PROGRAM or FUNCTION header found`; the UI rejects files containing NUL bytes or larger than 1 MB.
2. **The rename collides with other names**: `CALL OLD.NAME.HELPER`, `FN.OLD.NAME`, `OLD.NAMEX`, `I_OLD.NAME`. Expected: untouched. Tests in `routineRename.test.js`.
3. **CRLF line endings and lower-case routine names.** Expected: the rename keeps CRLF and the parser reads lower-case names. Tests: CRLF round-trip and a `subroutine my.routine` sample.
4. **The new name is invalid or the same as the old name.** Expected: a validation message and no download. Test: `validateNewName`.
5. **Legacy key migration repeats after the handoff context is consumed.** Expected: legacy keys are copied once only (a flag is set). Test: `migrateLegacyStorage` run twice after the new key was removed.

---

## File Structure (T24Tools)

```
.github/workflows/CI.yml, deploy-pages.yml   CI and Pages (Node 22, working-directory: .)
package.json, vite.config.js, playwright.config.js, eslint.config.js, .prettierrc.json, .prettierignore, .gitignore
index.html
public/tools/ofsMessageGenNew.html, t24_logMultiFile.html, t24tools-bridge.js
src/main.jsx, App.jsx, navigation.js, styles.css
src/components/Toaster.jsx, ErrorBoundary.jsx
src/lib/theme.js, toast.js, text.js, staleBuild.js, storage.js (+ tests)
src/features/tools/EmbeddedTools.jsx, tools.test.js
src/features/routineCreator/RoutineCreator.jsx, ImportPanel.jsx, routineCreatorState.js,
  routineImport.js, routineRename.js, __tests__/*.test.js
src/services/temenos/routineCatalog.js, routineGenerator.js, routineSnippets.js, routineTemplates.js, __tests__/routineGenerator.test.js
tests/e2e/t24tools.spec.js, tests/e2e/fixtures/ACCOUNT.EXTRACT.b
README.md, CHANGELOG.md, docs/ROUTINE_CREATOR.md, docs/TOOLS.md
```

### Task 1: Scaffold the T24Tools app shell

**Files:** create all config files, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/navigation.js`, `src/styles.css`, `src/lib/{theme,toast,text,staleBuild,storage}.js`, `src/components/*`, tests `src/lib/theme.test.js`, `src/lib/storage.test.js`, `src/lib/toast.test.js`.

**Interfaces (produces):**

- `NAV_TABS = [['routine','Routine Creator'],['ofs','OFS Message Generator'],['log','T24 Log Analyzer']]`
- `theme.js`: `THEMES`, `nextTheme`, `loadTheme(storage)`, `saveTheme(theme, storage)`, `applyTheme(theme, root)`; key `t24tools.theme`, falling back to `repomind.theme`.
- `storage.js`: `LEGACY_KEYS = { 't24tools.ofs.config': 'repomind.ofs.config', 't24tools.t24.ofsContext': 'repomind.t24.ofsContext', 't24tools.theme': 'repomind.theme' }`, `MIGRATION_FLAG = 't24tools.legacyImported'`, `migrateLegacyStorage(storage) → string[]` (the keys copied).
- `?tool=routine|ofs|log` selects the first tab.

- [ ] Write `storage.test.js` (copies missing keys, never overwrites, runs once even after a key is removed, survives blocked storage) and `theme.test.js` (RepoMind's tests with the new key). Run them: FAIL.
- [ ] Implement `storage.js` and `theme.js`; call `migrateLegacyStorage()` in `main.jsx` before `applyTheme(loadTheme())`. Run the tests: PASS.
- [ ] Copy the shell CSS from RepoMind `styles.css` (lines 1–160 base/tokens, `.tabs`, `.head`, `.panel`, footer, the 900px media query, nav 1311–1366, brand 1621–1650, accessibility 2219–2309, toasts 2554–2620) and the routine block 2685–2975. Add `.embedded-tool` from 612ca49^.
- [ ] `npm install`, `npm run check`. Commit happens at the end (one initial commit naming the source commits).

### Task 2: Move the Routine Creator

**Files:** copy RepoMind `routineCreator/*` and `services/temenos/routine*` with their tests; fix import paths (`../../lib/text`).

- [ ] Copy, run `npx vitest run src/features src/services`: the RepoMind tests PASS unchanged.

### Task 3: Restore the OFS Generator and the Log Analyzer

**Files:** `public/tools/*` from `git show 612ca49^:frontend/public/tools/<file>`; `src/features/tools/EmbeddedTools.jsx`, `tools.test.js`.

**Interfaces:** `BRIDGE_KEYS = ['t24tools.ofs.config','t24tools.t24.ofsContext']`; `handleBridgeMessage(data, { reply, onOpenTool, storage })` with message types `t24tools:bridge-ready | storage-snapshot | storage-set | storage-remove | open-tool`; `<SandboxedTool title file onOpenTool />`.

- [ ] Port the bridge tests from 612ca49^ `tools.test.js` (drop the runTool tests: that tool is not moving) with renamed keys plus a test that `repomind:*` messages are ignored. FAIL, then implement. PASS.
- [ ] Rename in the HTML: `repomind-bridge.js` → `t24tools-bridge.js`, `RepoMindBridge` → `T24ToolsBridge`, keys, "RepoMind" labels. In `App.jsx`, `onOpenTool('ofs')` switches to the OFS tab (which unmounts the Log iframe and mounts the OFS iframe fresh, as before).

### Task 4: Routine import parser (TDD)

**Files:** `src/features/routineCreator/routineImport.js`, `__tests__/routineImport.test.js`.

**Interfaces:** `parseRoutine(source, fileName?) → { name, kind: 'SUBROUTINE'|'PROGRAM'|'FUNCTION'|null, state, mapped: string[], unmapped: string[], calls: string[] }`. `state` is a full `createRoutineCreatorState()` shape.

Rules: the name comes from the first non-comment header line (otherwise from the file name, and that is reported). Developer and purpose come from header comments (`Developed By`, `Developer`, `Author`; `Purpose`, `Description`). Tables come from `$INSERT/$INCLUDE [BP] I_F.<APP>` and `"F.<APP>[$HIS|$NAU]"` literals, kept only when `<APP>` is in `ROUTINE_APPLICATIONS`; others are reported. `CALL F.READ` / `CALL F.WRITE` select the `Fread` / `Fwrite` snippets. A field is `Y.X = <recordVar><n>` (a numeric position from the source, with the table resolved through F.READ's FN variable) or `<recordVar><SYMBOL>` (a name only, position left blank). Nothing else is guessed. Other `CALL`s, the GOSUB labels and an invalid name are reported.

- [ ] Write the tests with a real-style sample (`$INSERT I_COMMON`, `$INSERT I_F.ACCOUNT`, FN/F vars, OPF, F.READ, `GOSUB INIT/PROCESS`, comments, `CALL ACCOUNT.EXTRACT.HELPER`, `CALL F.WRITE`, numeric and symbolic field use, an unknown application `AA.ARRANGEMENT`). FAIL → implement → PASS.

### Task 5: Routine rename (TDD)

**Files:** `routineRename.js`, `__tests__/routineRename.test.js`.

**Interfaces:** `renameRoutine(source, oldName, newName) → { text, changes: [{ line, before, after }] }`; `validateNewName(name, oldName) → string|null`.

Rule: replace `oldName` only where it is a whole T24 identifier (neighbours are not `[A-Za-z0-9_.$%]`), case-sensitive, on every line (header, comments, strings, recursive CALL). Line endings are preserved.

- [ ] Tests: header renamed; `CALL ACCOUNT.EXTRACT.HELPER` untouched; `FN.ACCOUNT.EXTRACT` and `I_ACCOUNT.EXTRACT` untouched; comment and `CRT "ACCOUNT.EXTRACT …"` renamed; CRLF preserved; `PROGRAM`/`FUNCTION` headers; the changes list is exact. FAIL → implement → PASS.

### Task 6: Import and copy UI

**Files:** `ImportPanel.jsx` (the file input, the report, the copy mode), changes to `RoutineCreator.jsx`, CSS `.routine-import*`, `.routine-diff*`.

- [ ] An "Open existing routine" button (a hidden `<input type="file" aria-label="Open existing routine">`). The file is read with `File.text()` and rejected when it holds NUL bytes or is over 1 MB. On success: `setState(result.state)` and the report card ("Imported from FILE": mapped list, "Not mapped" list).
- [ ] Mode tabs "Creator" / "Copy with new name". Copy mode: a "New routine name" input, a diff list (`- before` / `+ after` with line numbers), a read-only preview textarea "Renamed routine", Copy and Download (`NEW.NAME.b`).

### Task 7: E2E, docs, CI, first commit and push

- [ ] `tests/e2e/t24tools.spec.js`: the header has exactly the 3 tabs and a working theme toggle; Routine Creator generates and validates; import + rename with a preview and diff (the CALL is not renamed); the OFS iframe is sandboxed and persists `t24tools.ofs.config` (the parent's storage is unreachable); a legacy `repomind.ofs.config` loads; the Log Analyzer loads and its OFS entry hands off to the OFS Generator.
- [ ] README, CHANGELOG, `docs/ROUTINE_CREATOR.md` (moved, plus import/copy), workflows.
- [ ] `npm run check` and `npm run test:e2e` green → commit (naming RepoMind 7bf328c, 612ca49^ = 3560897) → push.

### Task 8: RepoMind cleanup

- [ ] Delete the Routine Creator files and `docs/ROUTINE_CREATOR.md`; remove the nav entry (Analyze keeps `Markdown`), the App route and lazy import, the CSS block 2685–2975 (move `.eyebrow` out first if it is used elsewhere), and 'Routine Creator' from the E2E header list.
- [ ] Run the Temenos unit tests (`npx vitest run src/services/temenos src/features/codebase`), then `npm run check` and `npm run test:e2e`.
- [ ] CHANGELOG ("moved to T24Tools" + link), README, `docs/IMPLEMENTATION_STATE.md`. Commit and push.
