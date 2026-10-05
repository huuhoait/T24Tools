# Changelog

## Unreleased

### Added

- **Routine Builder** (`?tool=builder`): the Routine Creator with the Artefact Generator's
  application search and field lists. Load a release, pick any of its applications (not only the
  16 built-in ones) and tick fields; their positions come from the release. Without a knowledge
  file it works like the Routine Creator, which is unchanged. See
  [docs/ROUTINE_BUILDER.md](docs/ROUTINE_BUILDER.md).
- The R23 and R25 knowledge files are published with the site: download them from the header
  (**Knowledge files: R23 ⬇ R25 ⬇**), or load one in a click with **Load R23 / R25 from this
  site**. A release loaded once is shared by the Artefact Generator and the Routine Builder.
- **JSON Viewer** (`?tool=json`): paste, drop or open any JSON and read it as a formatted,
  foldable tree. Only the visible rows are rendered, so a 19 MB `fields.json` opens in about a
  second and stays smooth fully expanded. Search across keys and values, copy a node's path or
  value, copy or download the formatted file, and see parse errors with their line and column.
  A knowledge file also gets a **T24 applications** index (application and field search, field
  table with position, property, type, mandatory, jBC name and value kind).
- JSON Viewer **Upload file**: drop or choose one or more `.json` files, switch between them or
  remove one from the list. Only the open file is parsed and held in memory.
- Artefact Generator: field inputs are a filterable list instead of a drop-down. Where a template
  supports it, tick several fields (or **Select all** / **Select shown**) and the field-specific
  code is repeated for each; one field still renders the compile-verified template unchanged.
  See [docs/ARTEFACT_GENERATOR.md](docs/ARTEFACT_GENERATOR.md#several-fields).

## 1.1.0 — 2026-10-03

### Added

- **Artefact Generator** (`?tool=artefact`): choose release → language → routine type → inputs and
  generate T24 source. 25 types: Infobasic VVR / VIR / VAR / NoFile / OFS routine, jBC validation /
  GET / WRITE / NoFile, and 16 L3 Java hooks (RecordLifecycle, ServiceLifecycle, Enquiry, AA
  ActivityLifecycle and Calculation, PaymentLifecycle, PaymentOrderLifecycle). Every template's
  example compiles against a real R25 install.
- Knowledge files: a per-release `fields.json` exported by Temenos-Skills, loaded from disk and
  kept only in this browser (IndexedDB). It provides field names, positions, jBC names and the
  single/multi-value flag. Java only offers single-value fields; jBC only offers fields that have
  a componentised name.
- Field check of the generated Infobasic / jBC source against the selected release.
- Footer and README disclaimer: not affiliated with or endorsed by Temenos.

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
