// OFS messages have five comma-separated parts: OPERATION,OPTIONS,USER INFO,ID INFO,DATA.
// Everything here is pure, so the generator UI and the Log Analyzer handoff share one model.

export const OFS_CONFIG_KEY = 't24tools.ofs.config';
export const OFS_HANDOFF_KEY = 't24tools.t24.ofsContext';

export const REQUEST_TYPES = [
  ['Transaction', 'Transaction'],
  ['Enquiry', 'Enquiry'],
  ['XMLReport', 'XML Report'],
  ['Clearing', 'Clearing'],
  ['TEC', 'TEC'],
];

export const FUNCTIONS = [
  ['I', 'I — Input'],
  ['A', 'A — Authorise'],
  ['D', 'D — Delete'],
  ['R', 'R — Reverse'],
  ['V', 'V — Verify'],
  ['', 'Blank (default I)'],
];

export const PROCESSING_FLAGS = [
  ['PROCESS', 'PROCESS'],
  ['VALIDATE', 'VALIDATE'],
  ['BUILD', 'BUILD'],
  ['', 'Blank (default PROCESS)'],
];

export const emptyValue = () => ({ mv: '', sv: '', value: '' });
export const newField = (name = '', values = []) => ({
  name,
  values: values.length ? values : [emptyValue()],
});

export function initialOfsState() {
  return {
    type: 'Transaction',
    application: '',
    version: '',
    fn: 'I',
    processing: 'PROCESS',
    gts: '',
    auth: '',
    user: '',
    password: '',
    company: '',
    transactionId: '',
    fields: [],
    enquiryName: '',
    genericId: '',
    genericData: '',
    xmlOption: 'ID',
  };
}

/** OFS data carries a comma inside a value as `?`. */
export const encodeValue = (v) => String(v ?? '').replace(/,/g, '?');
export const decodeValue = (v) => String(v ?? '').replace(/\?/g, ',');

/** VERSION/FUNCTION/PROCESSING/GTS/AUTHORISERS, with trailing blanks dropped and inner blanks kept. */
export function optionSegment({ version = '', fn = '', processing = '', gts = '', auth = '' }) {
  const parts = [version.trim(), fn, processing, gts.trim(), auth.trim()];
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.join('/');
}

export function userSegment({ user = '', password = '', company = '' }) {
  const u = user.trim();
  const c = company.trim();
  if (!u && !password && !c) return '';
  return u + '/' + password + (c ? '/' + c : '');
}

function valueSuffix(v) {
  return (v.mv ? ':' + v.mv : '') + (v.sv ? ':' + v.sv : '');
}

/** One field as it appears in the message data, e.g. `M.PHONE:1:2=0333`. */
export function fieldPreview(field) {
  const name = (field.name || 'FIELD').trim();
  return field.values.map((v) => name + valueSuffix(v) + '=' + encodeValue(v.value)).join(', ');
}

export function generateData(fields) {
  const out = [];
  for (const field of fields) {
    const name = (field.name || '').trim();
    if (!name) continue;
    for (const v of field.values) {
      if (v.value === '' && !v.mv && !v.sv) continue;
      out.push(name + valueSuffix(v) + '=' + encodeValue(v.value));
    }
  }
  return out.join(',');
}

/** Groups `FIELD:MV:SV=VALUE` tokens by field name, in first-seen order. */
function groupFields(tokens) {
  const byName = new Map();
  for (const t of tokens) {
    if (!byName.has(t.name)) byName.set(t.name, { name: t.name, values: [] });
    byName.get(t.name).values.push({ mv: t.mv, sv: t.sv, value: t.value });
  }
  return [...byName.values()];
}

export function parseData(raw) {
  const tokens = [];
  for (const token of String(raw || '').split(',')) {
    if (!token.trim()) continue;
    const eq = token.indexOf('=');
    const left = (eq >= 0 ? token.slice(0, eq) : token).trim();
    if (!left) continue;
    const value = eq >= 0 ? decodeValue(token.slice(eq + 1)) : '';
    const parts = left.split(':');
    let name = parts[0];
    let mv = parts[1] ?? '';
    let sv = parts[2] ?? '';
    if (parts.length > 3) {
      name = parts.slice(0, -2).join(':');
      mv = parts[parts.length - 2];
      sv = parts[parts.length - 1];
    }
    tokens.push({ name, mv, sv, value });
  }
  return groupFields(tokens);
}

/** Returns `{ message }` or `{ error }` for the current form. */
export function generateMessage(state) {
  const user = userSegment(state);
  switch (state.type) {
    case 'Transaction': {
      const operation = state.application.trim();
      if (!operation) return { error: 'Enter an application to build the message.' };
      return {
        message: [
          operation,
          optionSegment(state),
          user,
          state.transactionId.trim(),
          generateData(state.fields),
        ].join(','),
      };
    }
    case 'Enquiry':
      return {
        message: [
          state.enquiryName.trim() || 'ENQUIRY.SELECT',
          '',
          user,
          state.genericId.trim(),
          state.genericData,
        ].join(','),
      };
    case 'XMLReport':
      return {
        message: [
          'XML.REPORT',
          state.xmlOption,
          user,
          state.genericId.trim(),
          state.genericData,
        ].join(','),
      };
    case 'Clearing':
      return {
        message: ['CLEARING', '', user, state.genericId.trim(), state.genericData].join(','),
      };
    default:
      return { message: ['TEC', '', user, '', state.genericData].join(',') };
  }
}

/** Splits on the first four commas only: the data part keeps its own commas. */
export function splitMessage(raw) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < raw.length && parts.length < 4; i++) {
    if (raw[i] === ',') {
      parts.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(raw.slice(start));
  while (parts.length < 5) parts.push('');
  return parts;
}

export function requestTypeOf(operation) {
  const upper = operation.trim().toUpperCase();
  if (upper.includes('ENQUIRY')) return 'Enquiry';
  if (upper === 'XML.REPORT') return 'XMLReport';
  if (upper === 'CLEARING') return 'Clearing';
  if (upper === 'TEC') return 'TEC';
  return 'Transaction';
}

/**
 * Parses a full OFS message. Returns `{ type, parts, patch }`: `patch` is merged into the form
 * state, `parts` are the five raw segments for the summary.
 */
export function parseMessage(raw) {
  const parts = splitMessage(raw.trim());
  const [operation, options, userInfo, id, data] = parts;
  const type = requestTypeOf(operation);
  const [user = '', password = '', company = ''] = userInfo.split('/');
  const patch = { type, user, password, company };
  if (type === 'Transaction') {
    const [version = '', fn = '', processing = '', gts = '', auth = ''] = options.split('/');
    Object.assign(patch, {
      application: operation.trim(),
      version,
      fn,
      processing,
      gts,
      auth,
      transactionId: id,
      fields: parseData(data),
    });
  } else {
    Object.assign(patch, { genericId: id, genericData: data });
    if (type === 'Enquiry') patch.enquiryName = operation.trim();
    if (type === 'XMLReport') patch.xmlOption = options || 'ID';
  }
  return { type, parts, patch };
}

function normaliseFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.map((f) =>
    newField(
      String(f?.name ?? ''),
      (Array.isArray(f?.values) ? f.values : []).map((v) => ({
        mv: String(v?.mv ?? ''),
        sv: String(v?.sv ?? ''),
        value: String(v?.value ?? ''),
      })),
    ),
  );
}

const CONFIG_TEXT_KEYS = [
  'application',
  'version',
  'gts',
  'auth',
  'user',
  'company',
  'transactionId',
  'enquiryName',
  'genericId',
  'genericData',
];

/** The saved configuration. The password is never stored. */
export function configFromState(state) {
  const config = { type: state.type, fn: state.fn, processing: state.processing };
  for (const key of CONFIG_TEXT_KEYS) config[key] = state[key];
  config.xmlOption = state.xmlOption;
  config.fields = state.fields;
  return config;
}

/** Reads a saved configuration (including one saved by the earlier HTML tool or RepoMind). */
export function stateFromConfig(config, current = initialOfsState()) {
  if (!config || typeof config !== 'object') return null;
  const next = { ...current };
  next.type = REQUEST_TYPES.some(([id]) => id === config.type) ? config.type : 'Transaction';
  for (const key of CONFIG_TEXT_KEYS) next[key] = String(config[key] ?? '');
  next.fn = String(config.fn || 'I');
  next.processing = String(config.processing || 'PROCESS');
  next.xmlOption = config.xmlOption === 'XML' ? 'XML' : 'ID';
  next.fields = normaliseFields(config.fields);
  return next;
}

/** A log's version is `APPLICATION,VERSION`; the options segment wants only `VERSION`. */
export function versionName(application, version) {
  const v = String(version || '').trim();
  const prefix = String(application || '').trim() + ',';
  return v.toUpperCase().startsWith(prefix.toUpperCase()) ? v.slice(prefix.length) : v;
}

/** The context the Log Analyzer hands over, built from a parsed `<ofsApplication>` message. */
export function handoffFromOfs(ofs, rawXml = '') {
  return {
    application: ofs.application || '',
    version: ofs.version || '',
    ofsFunction: ofs.ofsFunction || 'I',
    ofsOperation: ofs.ofsOperation || '',
    transactionId: ofs.transactionId || '',
    companyId: ofs.companyId || '',
    gtsControl: ofs.gtsControl || '',
    authCount: ofs.authCount || '',
    fields: ofs.fields || [],
    rawXml,
  };
}

/** Form state for a Log Analyzer handoff. Authentication is left blank on purpose. */
export function stateFromHandoff(context, current = initialOfsState()) {
  if (!context || typeof context !== 'object' || !context.application) return null;
  const tokens = (Array.isArray(context.fields) ? context.fields : []).map((f) => ({
    name: String(f.fieldName || f.name || ''),
    mv: String(f.multiValueNumber || f.mv || ''),
    sv: String(f.subValueNumber || f.sv || ''),
    value: String(f.value ?? ''),
  }));
  return {
    ...current,
    type: 'Transaction',
    application: String(context.application),
    version: versionName(context.application, context.version),
    fn: String(context.ofsFunction || 'I'),
    transactionId: String(context.transactionId || ''),
    company: String(context.companyId || ''),
    gts: String(context.gtsControl || ''),
    auth: String(context.authCount || ''),
    fields: groupFields(tokens.filter((t) => t.name)),
  };
}
