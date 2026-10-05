# Routine Builder

The Routine Builder (`?tool=builder`) is a copy of the [Routine Creator](ROUTINE_CREATOR.md) whose
application and field inputs are the Artefact Generator's pickers, filled from a loaded knowledge
file. The Routine Creator itself is unchanged.

## With a knowledge file

1. **Release**: pick a loaded release, **Load knowledge file…** from disk, or **Load R23 / R25
   from this site**. A release loaded in the Artefact Generator is already here, and the other way
   round: both tools share one store in this browser.
2. **Application tables**: each table is the Artefact Generator's application search, over every
   application of the release, plus the optional `$HIS` / `$NAU` suffix.
3. **Fields**: one filterable field list per application (position, name, `SV` / `MV` /
   `MV-GROUP`). Tick fields one by one, or use **Select all** / **Select shown** and **Clear**. A
   ticked field takes its position from the release, so it always becomes `Y.<FIELD> = R.X<pos>`.
   Changing or removing a table clears the fields ticked for its old application, unless another
   table still uses it.

**Validate** reports a table whose application is not in the selected release.

Everything else is the Routine Creator: identity, snippets (including contextual F.READ / F.WRITE),
concatenate and clear options, legacy templates, the EVAL query helper, and **Open existing
routine** (Edit in creator / Copy with new name). Fields that no field list shows, such as fields
of an opened routine, are listed below the field lists as editable rows.

## Applications outside the built-in catalog

An application from the Routine Creator's 16-entry catalog keeps its catalog names (`FN.ACC`,
`R.ACC`, `R.CUS`, ...), so the output is byte for byte what the Routine Creator generates. Any
other application of the release gets names derived from the application:

| Use                  | Name (for `AA.ARRANGEMENT`)              |
| -------------------- | ---------------------------------------- |
| File name / file var | `FN.AA.ARRANGEMENT` / `F.AA.ARRANGEMENT` |
| Record / error       | `R.AA.ARRANGEMENT` / `E.AA.ARRANGEMENT`  |
| Record id            | `Y.AA.ARRANGEMENT.ID`                    |
| Layout insert        | `$INSERT I_F.AA.ARRANGEMENT`             |

The EVAL query helper strips the release's field prefix (`AA.ARR.`) for such an application.

## Without a knowledge file

The Builder works exactly like the Routine Creator: the 16 built-in applications in a drop-down,
and fields typed with an optional position (unverified fields become verification comments).

## Knowledge files published with the site

The R23 and R25 `fields.json` (about 18 MB each) are published at `knowledge/R23/fields.json` and
`knowledge/R25/fields.json`. The header's **Knowledge files: R23 ⬇ R25 ⬇** links download them, and
the **Load R23 / R25 from this site** buttons load them without the download/upload step.
`docs/t24tools/<R>/` stays the only copy in the repo: `src/build/knowledgeFiles.js` copies the
files into the build output (and serves them in `npm run dev`), and a unit test checks each file
against the SHA-256 in its `manifest.json`.

## Code

| File                                              | Responsibility                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `src/features/routineBuilder/RoutineBuilder.jsx`  | The page (a copy of `RoutineCreator.jsx` with the pickers)           |
| `src/features/routineBuilder/builderGenerator.js` | Copy of `routineGenerator.js` that also resolves knowledge-file apps |
| `src/features/routineBuilder/builderState.js`     | Field-list updates, release-aware validation and EVAL query          |
| `src/features/artefactGenerator/pickers.jsx`      | `AppInput`, `FieldPicker`, `ChoiceList` (shared with Artefact)       |
| `src/components/KnowledgePanel.jsx`               | Release choice and loading (shared with Artefact)                    |
| `src/lib/knowledge.js`                            | The app's one knowledge store                                        |
| `src/build/knowledgeFiles.js`                     | Publishes `docs/t24tools/<R>/` at `knowledge/<R>/`                   |
| `tests/e2e/builder.spec.js`                       | Header links, shared release, field pickers, one-click R23 load      |

The generator exists twice until the Builder replaces the Creator: a fix to one does not reach
the other. `builderGenerator.test.js` compares the two on catalog applications, so a change to the
original that the copy lacks is caught.
