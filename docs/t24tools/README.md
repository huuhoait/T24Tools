# Knowledge files

Per-release knowledge files for the **Artefact Generator** (`?tool=artefact`), exported by
[Temenos-Skills](https://github.com/zainknoman/Temenos-Skills) with
`python pipeline/release_t24tools.py --release <R>`.

| File | Contents |
| --- | --- |
| `R23/fields.json` | T24 R23: 4,596 applications, 162,842 fields |
| `R25/fields.json` | T24 R25: 4,838 applications, 171,858 fields |
| `<R>/manifest.json` | Release, schema version, counts and SHA-256 of the exported files |
| `templates.json` | The 25 artefact templates (same as `src/data/templates.json`) |

Each `fields.json` (schemaVersion 3) holds, per application, the field name, position, Java
alias, type / mandatory flag where known, componentised (jBC) name and single/multi-value flag.

The site publishes `R23/fields.json` and `R25/fields.json` at `knowledge/<R>/fields.json`. Download
one from the header (**Knowledge files: R23 ⬇ R25 ⬇**) and choose **Load knowledge file…**, or
click **Load R23 / R25 from this site** in the Artefact Generator or the Routine Builder. Either
way the file is kept only in your browser and shared by both tools. The site loads a file only
when you click one of these buttons.

Field descriptions (`descriptions.json`) are intentionally not published; the manifests still list
them because they are produced by the same export.

T24Tools is an independent project, not affiliated with or endorsed by Temenos. Temenos, T24 and
Transact are trademarks of Temenos AG.
