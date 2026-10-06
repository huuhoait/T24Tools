# OFS Message Generator and T24 Log Analyzer

Both tools are React features like the rest of T24Tools, in the same card layout and theme:

| File                                         | Role                                                         |
| -------------------------------------------- | ------------------------------------------------------------ |
| `src/features/ofsGenerator/ofsMessage.js`    | Build and parse OFS messages, saved config, handoff mapping  |
| `src/features/ofsGenerator/OfsGenerator.jsx` | OFS Message Generator UI (`?tool=ofs`)                       |
| `src/features/logAnalyzer/logParser.js`      | Parse log lines, OFS warnings, `<ofsApplication>`, other XML |
| `src/features/logAnalyzer/LogAnalyzer.jsx`   | T24 Log Analyzer UI (`?tool=log`)                            |

The two `.js` modules are pure and covered by unit tests; the UI only calls them. Up to 1.1.0
both tools were self-contained HTML pages in `public/tools/`, run in sandboxed iframes with a
`postMessage` storage bridge. Those pages, the bridge and the iframes are gone, and the production
Content Security Policy now refuses frames (`frame-src 'none'`).

## OFS Message Generator

- The message is rebuilt as you type: `OPERATION,OPTIONS,USER/PASSWORD/COMPANY,ID,DATA`.
  Request types: Transaction, Enquiry, XML Report, Clearing, TEC.
- Message data is edited as fields with MV / SV / value rows; commas inside a value are sent as
  `?`. **Paste message data** replaces the fields from a raw `FIELD:MV:SV=VALUE,…` string.
- **Parse a message** fills the form from a complete OFS message and shows its five parts. The
  password is masked in that summary.
- **Save** writes the form to `t24tools.ofs.config` in this browser **without the password**;
  **Load saved** reads it back and keeps the password you have typed. Configurations saved by the
  earlier HTML tool or RepoMind load as before.

## T24 Log Analyzer

- Open or drop any number of `.log` / `.txt` files, and/or paste log lines. Each source gets its own
  column; 200 entries render per column, with **Show more** for the rest.
- Lines in the form `[LEVEL ]YYYYMMDD HH:MM:SS.ffff THREAD [SESSION] [USER] [MODULE] message` are
  parsed; other lines (stack traces, continuations) are kept as `LINE` entries.
- The filter searches the whole line, its OFS XML and warnings across every source. Level chips
  narrow to one level, or to entries carrying an OFS message.
- An entry opens in a dialog: header facts, OFS warnings, the `<ofsApplication>` header and field
  table, other XML messages (indented), and the raw line, each with **Copy**.

## Log Analyzer → OFS Generator handoff

An entry with an `<ofsApplication>` message shows **Open in OFS Generator**. Clicking it:

1. stores the parsed message (application, version, function, operation, transaction id, company,
   GTS control, authoriser count, fields, raw XML) under `t24tools.t24.ofsContext`;
2. switches to the OFS Message Generator, which mounts fresh and fills the form from it. A logged
   version `FUNDS.TRANSFER,ACTR` becomes the version name `ACTR`; repeated fields are grouped
   with their MV / SV positions. User and password are left blank on purpose;
3. removes `t24tools.t24.ofsContext`, so the handoff is used once.

## Settings from RepoMind

RepoMind and T24Tools share the `zainknoman.github.io` origin. On the first visit
`src/lib/storage.js` copies `repomind.ofs.config`, `repomind.t24.ofsContext` and `repomind.theme`
to the `t24tools.*` keys when those are empty, then sets `t24tools.legacyImported` so it never runs
again. The RepoMind values are left in place.
