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

To use one, download it, then in T24Tools choose **Artefact Generator → Load knowledge file…**.
The file stays in your browser. The website does not load these files by itself.

Field descriptions (`descriptions.json`) are intentionally not published; the manifests still list
them because they are produced by the same export.

T24Tools is an independent project, not affiliated with or endorsed by Temenos. Temenos, T24 and
Transact are trademarks of Temenos AG.
