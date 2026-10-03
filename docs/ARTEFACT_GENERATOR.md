# Artefact Generator

Generates T24 / Transact routines and L3 Java hooks from templates whose examples compile against a
real T24 install. Open it from the header or with `?tool=artefact`.

## The flow

1. **Release**: pick a release you have loaded, or **Load knowledge file…** to add one.
2. **Language**: Infobasic (legacy), jBC (componentised) or Java (L3 hooks).
3. **Routine type**: 25 types, listed below. A type that has no compile-verified template is shown
   disabled as _coming soon_.
4. **Inputs**: built from the template. Applications are searched in the selected release. The
   field picker shows each field's position, whether it is single-value (`SV`) or multi-value
   (`MV`, `MV-GROUP`), and what the generated code will contain.
5. **Generate**: one tab per file (a jBC or Infobasic routine also gets its `.component`), with
   **Copy** and **Download**. For Infobasic and jBC, the generated source is checked again, and
   every field name in it must exist in the selected release.

## Knowledge files

Field names, positions, jBC names and the single/multi-value flag come from a **knowledge file**:
`fields.json`, one per release, exported by Temenos-Skills (`pipeline/release_t24tools.py
--release <R>`, schema version 3).

- The knowledge file is Temenos-derived data, so T24Tools does not bundle it. You load your own
  copy from disk.
- It is stored only in this browser (IndexedDB). It is never uploaded, and T24Tools makes no
  network calls.
- If the browser blocks storage (for example in a private window), the file still works for the
  session. T24Tools tells you it will not be remembered.
- A file with an older schema version, no release, or that is not JSON is rejected, and the reason
  stays on screen.

## Rules the generator enforces

| Language  | A field input becomes                                       | Refused when                                                       |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Infobasic | its EQU name (`EB.CUS.SECTOR`)                              | the field is not in the release                                    |
| jBC       | its componentised name (`ST.Customer.Customer.EbCusSector`) | the field has no componentised name in that release                |
| Java      | its getter (`getSector()`)                                  | the field is multi-value, or the record class has no getter for it |

Componentised names differ between releases (for example, R25 keeps the application prefix in many
local modules where R23 did not), so always generate for the release you will deploy to.
Generation never leaves a `{{PLACEHOLDER}}` in the output: missing inputs are listed instead.

## Routine types

| Language        | Types                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Infobasic (5)   | VVR, VIR, VAR, NoFile enquiry, OFS routine (`OFS.POST.MESSAGE`). Each comes with `$PACKAGE` and a `.component`, which R25 requires even for `$INSERT`-style routines.                                                                                                                                                                                                                                                                                   |
| jBC (4)         | Validation routine, GET method, WRITE method (OFS), NoFile enquiry                                                                                                                                                                                                                                                                                                                                                                                      |
| Java hooks (16) | RecordLifecycle `checkId`, `defaultFieldValues`, `defaultFieldValuesOnHotField`, `validateRecord`, `validateField` (deprecated in R25), `updateRecord`, `postUpdateRequest`, `isOverrideAutoApprove`; ServiceLifecycle; Enquiry `setIds` / `setFilterCriteria` / `setValue`; AA `ActivityLifecycle.validateRecord`; AA `Calculation.getChargeAmount`; `PaymentLifecycle.validatePaymentForClearing`; `PaymentOrderLifecycle.validatePaymentOrderRecord` |

## Where the templates come from

`src/data/templates.json` is exported by Temenos-Skills (`pipeline/release_t24tools.py`). It holds
the developer's own templates, never Temenos field data. Each template is **proven** before it is
exported: rendering its golden case must reproduce a reference file byte for byte, and that file
must compile against a real R25 install with its field names verified on R23 and R25.

`render.js` re-implements the Temenos-Skills renderer. `render.test.js` replays every golden case
on both releases and requires the same resolved values and identical output.

To update the templates, re-export `templates.json` in Temenos-Skills and copy it to
`src/data/templates.json`.

## Code

| File                                                           | Responsibility                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/features/artefactGenerator/ArtefactGenerator.jsx`         | The five-step screen                                                                 |
| `src/features/artefactGenerator/knowledgeStore.js`             | Validate and keep knowledge files per release (IndexedDB, session fallback)          |
| `src/features/artefactGenerator/catalog.js`                    | Application search and per-language field pickers (the only reader of field data)    |
| `src/features/artefactGenerator/render.js`                     | Resolve inputs and render templates (port of Temenos-Skills `artefact_templates.py`) |
| `src/features/artefactGenerator/fieldCheck.js`                 | Field check of generated Infobasic / jBC source                                      |
| `tests/e2e/artefact.spec.js` + `fixtures/knowledge-RTEST.json` | End-to-end flows with a synthetic knowledge file                                     |
