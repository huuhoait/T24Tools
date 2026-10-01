# Routine Creator

The Routine Creator is a native JavaScript/Vite Temenos routine workspace built on the recovered
Phase 1 generator. It deliberately does not import or port the standalone Java Swing UI. It moved
from RepoMind (Analyze → Routine Creator) to T24Tools in 1.0.0.

## Phase 1 — generator/model layer

Phase 1 provides deterministic legacy Temenos/Infobasic routine generation from a small application
catalog, verified field positions, reusable snippets, recovered legacy templates, EVAL query
generation, and safe snippet insertion (`src/services/temenos/routine*.js`).

The generator deliberately does **not** infer unverified field positions. A field without a numeric
position is emitted as a verification comment rather than invalid BASIC such as
`R.ACC<AC.CUSTOMER>`.

## Phase 2 — native UI

Phase 2 exposes the Phase 1 model in the **Routine Creator** tab
(`src/features/routineCreator/`).

The UI provides:

- routine name, developer and purpose metadata
- application table selection
- explicit `$HIS` and `$NAU` suffix selection
- field selection with optional verified positions
- all 14 recovered snippets
- contextual F.READ and F.WRITE generation
- concatenate and explicit clear-field options
- recovered legacy template presets
- EVAL query helper
- live generated routine preview
- validation feedback
- copy and `.b` download actions

The UI calls the Phase 1 generator directly. It does not duplicate routine-generation logic.

## Open existing routine

**📂 Open existing routine** reads a routine file (`.b`, `.txt` or extensionless, at most 1 MB, no
binary data) with the browser's File API. Nothing is uploaded. The file is parsed by
`parseRoutine(source, fileName)` in `routineImport.js`, and the result has two modes.

### Edit in creator

The creator state is replaced with what the model can represent:

| Creator setting    | Read from                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routine name       | The first non-comment `SUBROUTINE`, `PROGRAM` or `FUNCTION` line (any case); otherwise the file name, reported.                                                                                    |
| Developer          | A header comment `* Developed By :`, `* Developer :` or `* Author :`.                                                                                                                              |
| Purpose            | A header comment `* Purpose :` or `* Description :`.                                                                                                                                               |
| Application tables | `"F.<APP>"` / `'F.<APP>$HIS'` / `'F.<APP>$NAU'` literals, then `$INSERT` / `$INSERT <BP> I_F.<APP>` of applications the routine does not open. Only catalog applications.                          |
| F.READ / F.WRITE   | `CALL F.READ(…)` and `CALL F.WRITE(…)` (not F.READU and the like).                                                                                                                                 |
| Fields             | Records filled by `CALL F.READ(FN.X, id, R.X, …)` where `FN.X = "F.<APP>"`: `Y.NAME = R.X<5>` becomes field `NAME` at position 5; `R.X<AC.CUSTOMER>` becomes field `AC.CUSTOMER` with no position. |

Everything else keeps its default (no template, no concatenation, no clearing, no EVAL query), and
these are listed under **Not mapped**:

- applications that are not in the catalog (for example `AA.ARRANGEMENT`)
- a `PROGRAM` or `FUNCTION` header (the creator generates a `SUBROUTINE`)
- a name with characters the creator does not accept (such as `$` or `%`)
- `CALL`s other than F.READ, F.WRITE, OPF and JOURNAL.UPDATE
- paragraphs other than `INIT` and `PROCESS`
- `R.NEW(…)` / `R.OLD(…)` access, whose application the source does not state
- record access without a field name (`IF R.ACC<5> …`) or with a multi-value or variable position
  (`R.ACC<5,1>`, `R.ACC<Y.POS>`)
- a missing header, or no catalog application at all (the table list is left empty, not filled
  with a default)

The creator regenerates INIT and PROCESS from its settings, so the rest of the routine's logic is
not carried over.

### Copy with new name

The uploaded source is kept exactly as it is, and only the routine itself is renamed by
`renameRoutine(source, oldName, newName)` in `routineRename.js`:

- The old name is replaced only where it stands alone as a T24 identifier: it is not preceded by a
  letter, digit, `_`, `$`, `%` or `.`, and not followed by one of those or by a `.` that continues
  the name. A full stop that ends a sentence still counts as the end of the name.
- Matching is case-sensitive. The header, the routine's own name in comments and strings, and a
  recursive `CALL` are renamed. `CALL ACCOUNT.EXTRACT.HELPER`, `CALL OTHER.ACCOUNT.EXTRACT`,
  `FN.ACCOUNT.EXTRACT` and `$INSERT I_ACCOUNT.EXTRACT` are left alone when renaming
  `ACCOUNT.EXTRACT`.
- Line endings (LF, CRLF) are preserved, and every other byte is unchanged.

The new name must start with a letter, contain only letters, digits, `_` and `.`, and differ from
the old name. A diff lists every changed line (line number, before, after) next to a preview, and
the result can be copied or downloaded as `<NEW.NAME>.b`.

## Verification rules

- field positions are never invented, including when a routine is opened
- unverified fields produce verification comments
- table and field ordering remains deterministic
- repeated table/field input is handled by the Phase 1 generator
- `clearFields` remains opt-in
- recovered templates are presented as legacy reference presets
- anything an opened routine contains that the model cannot hold is reported, not dropped silently

## Deliberate exclusions

The Routine Creator does not:

- port Swing/decompiled Java UI code
- introduce TypeScript
- discover application fields from a repository (RepoMind analyses T24 source code)
- claim modern DS Packager generation
- upload or save routines anywhere; copy and download are the only outputs
