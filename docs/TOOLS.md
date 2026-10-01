# OFS Message Generator and T24 Log Analyzer

Both tools are self-contained HTML pages in `public/tools/`, kept as they were in RepoMind apart
from the `repomind` → `t24tools` renames. ESLint and Prettier skip that folder on purpose.

## Sandbox and bridge

`src/features/tools/EmbeddedTools.jsx` loads each page in an iframe with
`sandbox="allow-scripts allow-downloads allow-modals allow-forms"` (no `allow-same-origin`), so
the page has an opaque origin and cannot reach the app's storage or navigate it.

`public/tools/t24tools-bridge.js` gives the pages `T24ToolsBridge.ready/get/set/remove/openTool`:

1. On load the page posts `t24tools:bridge-ready`; the app answers with a
   `t24tools:storage-snapshot` of the allow-listed keys.
2. `set` / `remove` post `t24tools:storage-set` / `t24tools:storage-remove`; the app writes only
   `t24tools.ofs.config` and `t24tools.t24.ofsContext`, as strings of at most 1,000,000 characters.
3. `openTool('ofs')` posts `t24tools:open-tool`; the app switches to the OFS Message Generator.

Opened directly (not in a frame), the bridge uses the page's own `localStorage` and `openTool`
navigates to `../?tool=ofs`.

## Log Analyzer → OFS Generator handoff

An entry with an `<ofsApplication>` message shows **📨 Open in OFS Generator**. Clicking it:

1. stores the parsed message (application, version, function, operation, transaction id, company,
   fields, raw XML) under `t24tools.t24.ofsContext`;
2. asks the app to open the OFS tool. The Log Analyzer frame unmounts, and the OFS Generator frame
   mounts fresh and receives the context in its storage snapshot;
3. the OFS Generator fills the form, generates the message data, leaves the authentication fields
   blank and removes `t24tools.t24.ofsContext`, so the handoff is used once.

## Settings from RepoMind

RepoMind and T24Tools share the `zainknoman.github.io` origin. On the first visit
`src/lib/storage.js` copies `repomind.ofs.config`, `repomind.t24.ofsContext` and `repomind.theme`
to the `t24tools.*` keys when those are empty, then sets `t24tools.legacyImported` so it never runs
again. The RepoMind values are left in place.
