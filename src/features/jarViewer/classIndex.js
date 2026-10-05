// Reading of a classes.json class index (exported by Temenos-Skills pipeline/class_export.py):
// string tables + one tuple per class, [name, packageIdx, jarIdx, typeIdx, flags, superclass,
// interfaces, methods?]. Flags: 1 interface, 2 abstract. Public classes only.

export const SUPPORTED_SCHEMA = 1;
export const DEFAULT_HIDDEN_TYPES = ['internal', 'test'];

export function decodeClassIndex(doc) {
  if (doc?.kind !== 't24-classes')
    throw new Error(
      "This isn't a classes.json (expected kind t24-classes). Open fields.json and other JSON in the Application Viewer.",
    );
  if (doc.schemaVersion !== SUPPORTED_SCHEMA)
    throw new Error(
      `classes.json format version ${doc.schemaVersion} is not supported; this JAR Viewer reads version ${SUPPORTED_SCHEMA}.`,
    );
  const byQualified = new Map();
  const classes = doc.classes.map(([name, p, j, t, flags, superclass, interfaces, methods]) => {
    const pkg = doc.packages[p];
    const entry = {
      name,
      package: pkg,
      qualified: pkg ? `${pkg}.${name}` : name,
      jar: doc.jars[j],
      type: doc.types[t],
      isInterface: (flags & 1) !== 0,
      isAbstract: (flags & 2) !== 0,
      superclass: superclass || '',
      interfaces: interfaces || [],
      methods: methods || null,
    };
    if (!byQualified.has(entry.qualified)) byQualified.set(entry.qualified, []);
    byQualified.get(entry.qualified).push(entry);
    return entry;
  });
  return {
    release: doc.release,
    generated: doc.generated,
    jars: doc.jars,
    types: doc.types,
    classes,
    byQualified,
  };
}

function rank(entry, q) {
  const name = entry.name.toLowerCase();
  if (name === q || entry.qualified.toLowerCase() === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (entry.qualified.toLowerCase().includes(q) || entry.jar.toLowerCase().includes(q)) return 3;
  return -1;
}

export function searchClasses(index, query, { types = null, limit = 200 } = {}) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { results: [], total: 0 };
  const hits = [];
  for (const entry of index.classes) {
    if (types && !types.has(entry.type)) continue;
    const r = rank(entry, q);
    if (r >= 0) hits.push([r, entry]);
  }
  hits.sort(
    (x, y) =>
      x[0] - y[0] ||
      x[1].name.length - y[1].name.length ||
      x[1].qualified.localeCompare(y[1].qualified),
  );
  return { results: hits.slice(0, limit).map(([, e]) => e), total: hits.length };
}

export function isJarQuery(index, query) {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/\.jar$/, '');
  if (!q) return null;
  return index.jars.find((jar) => jar.toLowerCase().replace(/\.jar$/, '') === q) || null;
}

export function classesInJar(index, jar) {
  const groups = new Map();
  for (const entry of index.classes) {
    if (entry.jar.toLowerCase() !== jar.toLowerCase()) continue;
    if (!groups.has(entry.package)) groups.set(entry.package, []);
    groups.get(entry.package).push(entry);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function compareReleases(a, b) {
  const jarsOf = (index, q) => (index.byQualified.get(q) || []).map((e) => e.jar).sort();
  const out = new Map();
  for (const q of new Set([...a.byQualified.keys(), ...b.byQualified.keys()])) {
    const ja = jarsOf(a, q);
    const jb = jarsOf(b, q);
    const status = !jb.length
      ? 'onlyA'
      : !ja.length
        ? 'onlyB'
        : ja.join('\n') === jb.join('\n')
          ? 'same'
          : 'moved';
    out.set(q, { status, a: ja, b: jb });
  }
  return out;
}
