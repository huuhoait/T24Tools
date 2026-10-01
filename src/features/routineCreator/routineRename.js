// "Copy with new name": keeps an uploaded routine as it is and renames only the routine itself.
//
// T24 names are dotted identifiers, so a plain word match would also rename ACCOUNT.EXTRACT.HELPER
// or FN.ACCOUNT.EXTRACT when renaming ACCOUNT.EXTRACT. The old name is replaced only where it
// stands alone: not preceded by an identifier character or a dot, and not followed by an
// identifier character or by a dot that continues the identifier (a full stop ending a sentence
// still counts as the end of the name). Matching is case-sensitive, so a routine's own name in a
// header, comment, string or recursive CALL is renamed, while other routines are left alone.

const CREATOR_NAME = /^[A-Za-z][A-Za-z0-9_.]*$/;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @returns {{ text: string, changes: { line: number, before: string, after: string }[] }}
 */
export function renameRoutine(source, oldName, newName) {
  const text = String(source ?? '');
  const from = String(oldName ?? '');
  if (!from) return { text, changes: [] };
  const pattern = new RegExp(
    '(?<![A-Za-z0-9_$%.])' + escapeRegExp(from) + '(?![A-Za-z0-9_$%]|\\.[A-Za-z0-9_$%])',
    'g',
  );
  // Splitting with a capture group keeps each line ending next to its line.
  const parts = text.split(/(\r\n|\r|\n)/);
  const changes = [];
  for (let i = 0; i < parts.length; i += 2) {
    const before = parts[i];
    const after = before.replace(pattern, () => newName);
    if (after !== before) {
      parts[i] = after;
      changes.push({ line: i / 2 + 1, before, after });
    }
  }
  return { text: parts.join(''), changes };
}

/** Returns why `name` cannot be used as the new routine name, or null when it can. */
export function validateNewName(name, oldName) {
  const value = String(name ?? '').trim();
  if (!value) return 'Enter a new routine name.';
  if (!CREATOR_NAME.test(value)) {
    return 'Routine name must start with a letter and contain only letters, numbers, underscores, or dots.';
  }
  if (value === oldName) return 'The new name is the same as the current name.';
  return null;
}
