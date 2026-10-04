# T24Tools

Temenos T24 / Transact developer tools that run entirely in your browser. Nothing you open, paste
or generate is uploaded anywhere.

| Tool                      | What it does                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Routine Creator**       | Generates legacy T24/Infobasic routines (tables, verified field positions, F.READ/F.WRITE and other snippets, legacy templates, EVAL queries). **Open existing routine** reads a `.b` file back into the creator or copies it under a new name.                                                                                    |
| **Artefact Generator**    | Generates T24 routines and L3 Java hooks in 25 types (Infobasic, jBC, Java). You choose the release, the language and the type, then fill in the inputs. Field names come from a knowledge file you load from your own Temenos-Skills; it stays in this browser. Every template's example compiles against a real T24 R25 install. |
| **OFS Message Generator** | Builds, parses and inspects OFS messages using the five-part message structure. Configurations are saved in this browser.                                                                                                                                                                                                          |
| **T24 Log Analyzer**      | Reads up to three T24/TAFJ log files (or pasted content), filters entries, shows OFS and XML details, and sends an entry's OFS message to the OFS Message Generator.                                                                                                                                                               |
| **JSON Viewer**           | Formats pasted or opened JSON as a foldable, searchable tree, fast even for a 20 MB `fields.json`. A knowledge file also gets a T24 applications index: search an application or field and see its fields as a table.                                                                                                              |

The Routine Creator, OFS Message Generator and T24 Log Analyzer moved here from [RepoMind](https://github.com/zainknoman/RepoMind), which now
focuses on codebase intelligence (including analysis of T24 source code). See
[CHANGELOG.md](CHANGELOG.md) for the origin of each tool.

## Using it

- **Routine Creator → Open existing routine** accepts `.b`, `.txt` and extensionless routine files
  (such as `BP/ACCOUNT.VALIDATE`), up to 1 MB.
  - _Edit in creator_ fills the creator with what its model can represent: the name, developer and
    purpose from the header comments, the catalog applications from `$INSERT I_F.<APP>` and
    `"F.<APP>"` opens (with `$HIS` / `$NAU`), F.READ / F.WRITE, and fields read from a record that
    an F.READ fills. A field keeps a position only when the source states one. Everything else is
    listed under **Not mapped**.
  - _Copy with new name_ keeps the source as it is and renames only the routine: its
    SUBROUTINE / PROGRAM / FUNCTION header and its own name in comments, strings and calls to
    itself. `CALL ACCOUNT.EXTRACT.HELPER` is not touched when renaming `ACCOUNT.EXTRACT`. A diff
    lists every changed line before you copy or download the `.b` file.
- **T24 Log Analyzer → entry → 📨 Open in OFS Generator** switches to the OFS Message Generator
  with the application, version, function, transaction id, company and fields filled in.
  Authentication fields are left blank on purpose.
- `?tool=routine`, `?tool=artefact`, `?tool=ofs`, `?tool=log` and `?tool=json` open a tool directly.
- **Artefact Generator**: load a release's `fields.json` with **Load knowledge file…**, then
  choose the language, the routine type and the inputs. See
  [docs/ARTEFACT_GENERATOR.md](docs/ARTEFACT_GENERATOR.md).
- **JSON Viewer**: paste JSON, or switch to **Upload file** to drop or choose one or more `.json` files (switch between them, or remove one, from the list). Files and pastes over
  256 KB are parsed straight into the tree instead of the text box. Click **Search** for keys and
  values, select a line to copy its path or value, and use **Download formatted** for the
  pretty-printed file. With a `fields.json` loaded, **T24 applications** lists every application
  and field; **Show in tree** jumps to the application's JSON.
- Settings saved by RepoMind's OFS tools (and RepoMind's theme) are carried over once on the first
  visit, because both apps are served from the same GitHub Pages origin.

More detail: [docs/ROUTINE_CREATOR.md](docs/ROUTINE_CREATOR.md),
[docs/ARTEFACT_GENERATOR.md](docs/ARTEFACT_GENERATOR.md) and [docs/TOOLS.md](docs/TOOLS.md).

## Development

Requires Node 22 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # format check, lint, unit tests, production build
npm run test:e2e     # Playwright against the production build at /T24Tools/
```

The first E2E run needs a browser: `npx playwright install chromium`.

## Deployment

GitHub Actions runs [CI](.github/workflows/CI.yml) on every push and pull request to `main`. When
CI succeeds on a push to `main`, [Deploy T24Tools to GitHub Pages](.github/workflows/deploy-pages.yml)
builds that exact commit and publishes `dist/` to `https://zainknoman.github.io/T24Tools/`.
Enable it once under **Settings → Pages → Source: GitHub Actions**.

## Security

The OFS Message Generator and the T24 Log Analyzer are self-contained pages in `public/tools/`.
They run in sandboxed iframes with an opaque origin: they cannot read T24Tools' storage or navigate
the app. They reach storage through `public/tools/t24tools-bridge.js`, and the app only honours
two keys (`t24tools.ofs.config`, `t24tools.t24.ofsContext`) and one action (open the OFS
Generator). The production build carries a Content Security Policy that allows no network
connections beyond this site.

## Disclaimer

T24Tools is an independent project. It is not affiliated with or endorsed by Temenos. Temenos,
T24 and Transact are trademarks of Temenos AG. T24Tools contains no Temenos data: field data is
loaded by each user from their own knowledge file and never leaves their browser.
