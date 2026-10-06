// Parses T24 / TAFJ log lines of the form
//   [LEVEL ]YYYYMMDD HH:MM:SS.ffff THREAD [SESSION] [USER] [MODULE] message
// and pulls OFS warnings, <ofsApplication> messages and other XML out of the message.
// Lines that do not match are kept as unparsed entries, so nothing in a file is hidden.

const LOG_LINE =
  /\[(\w+)\s*\](\d{8} \d{2}:\d{2}:\d{2}\.\d{4})\s+(\d+)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)/;
const OFS_WARNINGS = /<ofs><warnings>(.*?)<\/warnings><\/ofs>/s;
const OFS_APPLICATION = /<ofsApplication>.*<\/ofsApplication>/s;
const XML_ELEMENT = /<(\w+)(?:\s[^>]*)?>.*?<\/\1>/s;

export const OFS_HEADER_FIELDS = [
  'application',
  'version',
  'ofsFunction',
  'ofsOperation',
  'transactionId',
  'companyId',
  'requestType',
  'activeTab',
  'windowName',
  'title',
  'decrypt',
  'RecordRead',
  'gtsControl',
  'authCount',
];

/** `20260901 10:15:30.1234` → `2026-09-01 10:15:30.1234`. */
export function formatTimestamp(stamp) {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(9)}`;
}

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

const named = (el, name) =>
  el.localName === name || el.nodeName === name || el.nodeName.endsWith(':' + name);
const firstNamed = (root, name) =>
  Array.from(root.getElementsByTagName('*')).find((el) => named(el, name)) || null;

/** The header and fields of an `<ofsApplication>` message, or null when it is not valid XML. */
export function parseOfsXml(xml) {
  const doc = parseXml(xml);
  const app = doc && firstNamed(doc, 'ofsApplication');
  if (!app) return null;
  const ofs = { fields: [] };
  for (const name of OFS_HEADER_FIELDS) {
    const el = firstNamed(app, name);
    if (el) ofs[name] = el.textContent.trim();
  }
  const message = firstNamed(app, 'message');
  if (message) {
    for (const field of Array.from(message.getElementsByTagName('*'))) {
      if (!named(field, 'field')) continue;
      const get = (name) => firstNamed(field, name)?.textContent.trim() || '';
      const fieldName = get('fieldName');
      if (!fieldName) continue;
      ofs.fields.push({
        fieldName,
        value: get('value'),
        displayType: get('displayType'),
        multiValueNumber: get('multiValueNumber'),
        subValueNumber: get('subValueNumber'),
      });
    }
  }
  return ofs;
}

function parseWarnings(xml) {
  const doc = parseXml(xml);
  return doc ? Array.from(doc.getElementsByTagName('warningtext'), (w) => w.textContent) : [];
}

/** Removes `piece` from `text`, leaving one space where it was. */
function cut(text, piece) {
  const i = text.indexOf(piece);
  return (text.slice(0, i).trimEnd() + ' ' + text.slice(i + piece.length).trimStart()).trim();
}

/** Indents XML one level per open element, for reading. */
export function formatXml(xml) {
  let pad = 0;
  const out = [];
  for (const raw of xml.replace(/(>)(<)(\/?)/g, '$1\n$2$3').split('\n')) {
    const node = raw.trim();
    if (!node) continue;
    let indent = 0;
    if (/.+<\/\w[^>]*>$/.test(node)) indent = 0;
    else if (/^<\/\w/.test(node)) pad = Math.max(0, pad - 1);
    else if (/^<\w[^>]*>/.test(node) && !node.endsWith('/>')) indent = 1;
    out.push('  '.repeat(pad) + node);
    pad += indent;
  }
  return out.join('\n');
}

/** One log line as an entry. `line` is 1-based. */
export function parseLogLine(text, line = 1) {
  const entry = {
    line,
    raw: text,
    parsed: false,
    level: '',
    timestamp: '',
    thread: '',
    session: '',
    user: '',
    module: '',
    message: text,
    warnings: [],
    ofs: null,
    xml: [],
    error: false,
  };
  const m = text.match(LOG_LINE);
  if (m) {
    let message = m[7];
    Object.assign(entry, {
      parsed: true,
      level: m[1].trim().toUpperCase(),
      timestamp: formatTimestamp(m[2]),
      thread: m[3],
      session: m[4],
      user: m[5],
      module: m[6],
    });
    entry.error = entry.level === 'ERROR' || message.includes('#ERROR#');

    const warnings = message.match(OFS_WARNINGS);
    if (warnings) {
      entry.warnings = parseWarnings(`<warnings>${warnings[1]}</warnings>`);
      if (entry.warnings.length) message = cut(message, warnings[0]);
    }
    const ofsApp = message.match(OFS_APPLICATION);
    if (ofsApp) {
      entry.ofs = { rawXml: ofsApp[0], data: parseOfsXml(ofsApp[0]) };
      message = cut(message, ofsApp[0]);
    }
    let xml;
    while ((xml = message.match(XML_ELEMENT))) {
      entry.xml.push(xml[0]);
      message = cut(message, xml[0]);
    }
    entry.message = message;
  }
  entry.search = [
    text,
    entry.ofs?.rawXml,
    ...entry.warnings,
    ...entry.xml,
    entry.level,
    entry.timestamp,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return entry;
}

/** Every non-blank line of a log as an entry. */
export function parseLog(text) {
  const entries = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.trim()) entries.push(parseLogLine(line, i + 1));
    });
  return entries;
}

/** Case-insensitive text filter plus an optional level; `level` '' means any. */
export function matchesFilter(entry, query, level) {
  if (level && (level === 'OFS' ? !entry.ofs : entry.level !== level)) return false;
  return !query || entry.search.includes(query.toLowerCase());
}

/** The entry as plain text, for "Copy details". */
export function entryAsText(entry, sourceName) {
  const lines = [
    `Source: ${sourceName}`,
    `Line: ${entry.line}`,
    ...(entry.parsed
      ? [
          `Level: ${entry.level}`,
          `Timestamp: ${entry.timestamp}`,
          `Thread: ${entry.thread}`,
          `Session: ${entry.session}`,
          `User: ${entry.user}`,
          `Module: ${entry.module}`,
        ]
      : []),
  ];
  if (entry.warnings.length) lines.push('', 'Warnings:', ...entry.warnings.map((w) => '- ' + w));
  if (entry.ofs) {
    const d = entry.ofs.data;
    lines.push('', 'OFS application:');
    if (d) {
      for (const k of OFS_HEADER_FIELDS) if (d[k]) lines.push(`  ${k}: ${d[k]}`);
      for (const f of d.fields) {
        const pos = f.multiValueNumber
          ? `:${f.multiValueNumber}${f.subValueNumber ? ':' + f.subValueNumber : ''}`
          : '';
        lines.push(`  ${f.fieldName}${pos} = ${f.value}`);
      }
    } else lines.push(entry.ofs.rawXml);
  }
  if (entry.message.trim()) lines.push('', 'Message:', entry.message.trim());
  lines.push('', 'Raw line:', entry.raw);
  return lines.join('\n');
}
