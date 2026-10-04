// Pure model behind the JSON Viewer. A parsed document is never turned into one big pretty-printed
// string (a 19 MB knowledge file would be 36 MB of DOM text); instead the tree is flattened into the
// rows that are currently visible, given the set of expanded node ids, and the view renders only the
// rows inside the scroll window.

export const ROOT_ID = '$';
const SEP = '\u001f';

export const childId = (parentId, key) => parentId + SEP + key;

export const idOfPath = (path) => path.reduce(childId, ROOT_ID);

/** Ids of every container on the way to `path` (the root first), so the target becomes visible. */
export function ancestorIds(path) {
  const ids = [ROOT_ID];
  let id = ROOT_ID;
  for (const key of path.slice(0, -1)) ids.push((id = childId(id, key)));
  return ids;
}

export const isContainer = (v) => v !== null && typeof v === 'object';

const MAX_INLINE_ITEMS = 12;
const MAX_INLINE_CHARS = 240;

/**
 * Short arrays of primitives are printed on one line, as Prettier does:
 * [1, "AA.AGC.ACTIVITY", "AaArrAcAcctGroupCondn_Activity", null, null, null, null]
 */
export function inlineText(value) {
  if (!Array.isArray(value) || value.length > MAX_INLINE_ITEMS) return null;
  if (!value.length) return '[]';
  let size = 2;
  for (const item of value) {
    if (isContainer(item)) return null;
    size += String(item).length + 4;
    if (size > MAX_INLINE_CHARS) return null;
  }
  return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
}

const entriesOf = (value) =>
  Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);

export const sizeOf = (value) => (Array.isArray(value) ? value.length : Object.keys(value).length);

/**
 * Visible rows: { id, depth, key, value, type, last, isArray }.
 * type: 'leaf' (primitive), 'inline' (short primitive array), 'collapsed', 'open', 'close'.
 * `key` is undefined for array items and the root.
 */
export function buildRows(root, expanded) {
  const rows = [];
  const visit = (value, id, key, depth, last) => {
    if (!isContainer(value)) {
      rows.push({ id, depth, key, value, type: 'leaf', last });
      return;
    }
    const isArray = Array.isArray(value);
    const inline = inlineText(value);
    if (inline !== null) {
      rows.push({ id, depth, key, value, type: 'inline', text: inline, last, isArray });
      return;
    }
    if (!expanded.has(id)) {
      rows.push({ id, depth, key, value, type: 'collapsed', last, isArray });
      return;
    }
    rows.push({ id, depth, key, value, type: 'open', last, isArray });
    const entries = entriesOf(value);
    entries.forEach(([k, v], i) =>
      visit(v, childId(id, k), isArray ? undefined : k, depth + 1, i === entries.length - 1),
    );
    rows.push({ id: id + SEP + '}', depth, type: 'close', last, isArray, owner: id });
  };
  visit(root, ROOT_ID, undefined, 0, true);
  return rows;
}

/** Ids of every expandable container, or null when there are more than `limit`. */
export function allContainerIds(root, limit = 250_000) {
  const ids = [];
  const visit = (value, id) => {
    if (!isContainer(value) || inlineText(value) !== null) return true;
    if (ids.push(id) > limit) return false;
    for (const [k, v] of entriesOf(value)) if (!visit(v, childId(id, k))) return false;
    return true;
  };
  return visit(root, ROOT_ID) ? ids : null;
}

/** Counts used for the summary line and to choose what starts expanded. */
export function stats(root) {
  const s = { objects: 0, arrays: 0, values: 0, maxDepth: 0 };
  const stack = [[root, 0]];
  while (stack.length) {
    const [value, depth] = stack.pop();
    if (depth > s.maxDepth) s.maxDepth = depth;
    if (!isContainer(value)) {
      s.values++;
      continue;
    }
    if (Array.isArray(value)) {
      s.arrays++;
      for (let i = 0; i < value.length; i++) stack.push([value[i], depth + 1]);
    } else {
      s.objects++;
      for (const k in value) stack.push([value[k], depth + 1]);
    }
  }
  return s;
}

/** Small documents open fully; large ones open the root and its modest-sized children. */
export function defaultExpanded(root, counts = stats(root)) {
  if (counts.objects + counts.arrays <= 2000) return new Set(allContainerIds(root) || [ROOT_ID]);
  const ids = new Set([ROOT_ID]);
  if (isContainer(root))
    for (const [k, v] of entriesOf(root))
      if (isContainer(v) && sizeOf(v) <= 10_000) ids.add(childId(ROOT_ID, k));
  return ids;
}

/**
 * Keys and primitive values containing `query` (case-insensitive), in document order.
 * Returns { results: [{ path, match }], total } with at most `limit` results.
 */
export function searchJson(root, query, limit = 200) {
  const q = query.trim().toLowerCase();
  const results = [];
  let total = 0;
  if (!q) return { results, total };
  const path = [];
  const hit = (match) => {
    if (total++ < limit) results.push({ path: [...path], match });
  };
  const visit = (value) => {
    if (!isContainer(value)) {
      if (String(value).toLowerCase().includes(q)) hit('value');
      return;
    }
    const isArray = Array.isArray(value);
    for (const [k, v] of entriesOf(value)) {
      path.push(k);
      if (!isArray && k.toLowerCase().includes(q)) hit('key');
      visit(v);
      path.pop();
    }
  };
  visit(root);
  return { results, total };
}

/** Index of the row that shows `path`: the node itself, or the inline array holding it. */
export function rowIndexForPath(rows, path) {
  const index = new Map(rows.map((r, i) => [r.id, i]));
  let id = ROOT_ID;
  const ids = [id];
  for (const key of path) ids.push((id = childId(id, key)));
  for (let i = ids.length - 1; i >= 0; i--) if (index.has(ids[i])) return index.get(ids[i]);
  return -1;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** JavaScript-style path: apps["AA.ACCOUNT"].fields[3][1] */
export function pathLabel(path) {
  return (
    path
      .map((k, i) =>
        typeof k === 'number'
          ? `[${k}]`
          : IDENT.test(k)
            ? (i ? '.' : '') + k
            : `[${JSON.stringify(k)}]`,
      )
      .join('') || '(root)'
  );
}

/** Path (keys and indices) of a row id built by childId. */
export function pathOfId(root, id) {
  const parts = id.split(SEP).slice(1);
  const path = [];
  let node = root;
  for (const part of parts) {
    const key = Array.isArray(node) ? Number(part) : part;
    path.push(key);
    node = node?.[key];
  }
  return path;
}

export function valueAt(root, path) {
  return path.reduce((node, key) => node?.[key], root);
}

/** "Unexpected token … at position 812" -> " (line 14, column 3)" for the pasted text. */
export function errorLocation(message, text) {
  const m = /position (\d+)/.exec(message || '');
  if (!m || typeof text !== 'string') return '';
  if (/line \d+ column \d+/.test(message)) return '';
  const before = text.slice(0, Number(m[1]));
  const line = before.split('\n').length;
  const column = Number(m[1]) - before.lastIndexOf('\n');
  return ` (line ${line}, column ${column})`;
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
