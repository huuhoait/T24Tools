# Changelog

## 1.0.0 — 2026-10-01

First release. The three T24 tools moved here from
[RepoMind](https://github.com/zainknoman/RepoMind):

- **Routine Creator**, from RepoMind `7bf328c` (`frontend/src/features/routineCreator/`,
  `frontend/src/services/temenos/routine*.js`, their tests, `docs/ROUTINE_CREATOR.md` and the
  `routine-*` styles).
- **OFS Message Generator** and **T24 Log Analyzer**, restored from RepoMind `3560897`
  (`612ca49^`, the commit before "Complete P2 product cleanup" removed them): the
  `public/tools/` pages, the storage bridge and the sandboxed `EmbeddedTools` host with its tests.

### Added

- Routine Creator: **Open existing routine** (`.b`, `.txt` or extensionless). It fills the creator
  from the routine as far as its model can represent it and lists everything it could not map,
  without inventing field positions.
- Routine Creator: **Copy with new name** renames only the routine itself (header and its own
  name), never other routines such as a `CALL` to a helper. It shows a preview and a diff before
  you copy or download the `.b` file.
- A header with the three tools, RepoMind's look and its System / Light / Dark theme toggle.
- `?tool=routine|ofs|log` deep links.
- E2E tests for all three tools, including the Log Analyzer → OFS Generator handoff.

### Changed

- `repomind` identifiers became `t24tools`: `t24tools-bridge.js`, `window.T24ToolsBridge`,
  `t24tools:*` bridge messages, and the `t24tools.ofs.config`, `t24tools.t24.ofsContext` and
  `t24tools.theme` storage keys. The matching `repomind.*` values are copied once on the first
  visit, so saved OFS configurations and the theme carry over.
- The OFS Message Generator and the T24 Log Analyzer are separate header tabs instead of two tabs
  inside RepoMind's "Temenos / OFS" workspace.
