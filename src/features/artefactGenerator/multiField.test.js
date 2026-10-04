import { describe, expect, it } from 'vitest';
import TEMPLATES from '../../data/templates.json';
import { MULTI_FIELD, fieldList, generateFiles, isMultiField } from './multiField';

const templates = TEMPLATES.templates;

// Synthetic knowledge: two apps with jBC names and single-value getters, no Temenos data.
const field = (pos, name, recordClass, comp) => [
  pos,
  name,
  `${recordClass}_${name
    .split('.')
    .slice(1)
    .map((p) => p[0] + p.slice(1).toLowerCase())
    .join('')}`,
  null,
  null,
  `${comp}.${recordClass}.${name.replace(/\./g, '')}`,
  'SV',
];
const KNOWLEDGE = {
  release: 'RTEST',
  schemaVersion: 3,
  apps: {
    'SAMPLE.CUSTOMER': {
      prefix: 'SC.',
      recordClass: 'SampleCustomer',
      components: ['SM.Sample'],
      fields: ['SC.NAME', 'SC.SECTOR', 'SC.TOWN'].map((n, i) =>
        field(i + 1, n, 'SampleCustomer', 'SM.Sample'),
      ),
    },
    'SAMPLE.ACCOUNT': {
      prefix: 'SA.',
      recordClass: 'SampleAccount',
      components: ['SM.Sample'],
      fields: ['SA.TITLE', 'SA.LIMIT'].map((n, i) => field(i + 1, n, 'SampleAccount', 'SM.Sample')),
    },
    'AA.ARRANGEMENT.ACTIVITY': {
      prefix: 'AA.ARR.ACT.',
      recordClass: 'AaArrangementActivity',
      components: [],
      fields: ['AA.ARR.ACT.ARRANGEMENT', 'AA.ARR.ACT.ACTIVITY'].map((n, i) =>
        field(i + 1, n, 'AaArrangementActivity', 'AA.Framework'),
      ),
    },
    'PAYMENT.ORDER': {
      prefix: 'PO.',
      recordClass: 'PaymentOrder',
      components: [],
      fields: ['PO.AMOUNT', 'PO.CURRENCY'].map((n, i) =>
        field(i + 1, n, 'PaymentOrder', 'PI.Contract'),
      ),
    },
  },
};

/** Inputs for a template: examples for text inputs, apps/fields from the synthetic knowledge. */
function inputsFor(template, fieldsPerInput) {
  const inputs = {};
  for (const spec of template.inputs) {
    if (spec.kind === 'app')
      inputs[spec.id] =
        spec.fixed || (spec.id.startsWith('APP') ? 'SAMPLE.CUSTOMER' : 'SAMPLE.ACCOUNT');
    else if (spec.kind !== 'field') inputs[spec.id] = spec.example || 'X';
  }
  for (const spec of template.inputs.filter((s) => s.kind === 'field')) {
    const names = KNOWLEDGE.apps[inputs[spec.of]].fields.map((f) => f[1]);
    inputs[spec.id] = fieldsPerInput(spec, names);
  }
  return inputs;
}

describe('multi-field edits', () => {
  for (const [id, edits] of Object.entries(MULTI_FIELD)) {
    it(`${id}: every edit still matches its template exactly once`, () => {
      const text = Object.values(templates[id].files).join('\n');
      for (const edit of edits) expect(text.split(edit.find)).toHaveLength(2);
    });
  }

  it('marks only list-friendly inputs as multi', () => {
    expect(isMultiField('infobasic/vvr', 'FIELD')).toBe(true);
    expect(isMultiField('infobasic/var', 'FIELD')).toBe(false); // the linked record id
    expect(isMultiField('infobasic/var', 'LINK_FIELD')).toBe(true);
    expect(isMultiField('java/record-lifecycle-update', 'FIELD')).toBe(false);
    expect(isMultiField('java/record-lifecycle-validate-field', 'FIELD')).toBe(false);
  });

  it('reads single values and lists alike', () => {
    expect(fieldList('SC.NAME')).toEqual(['SC.NAME']);
    expect(fieldList(['SC.NAME', '', 'SC.TOWN'])).toEqual(['SC.NAME', 'SC.TOWN']);
    expect(fieldList(undefined)).toEqual([]);
  });
});

describe('generateFiles', () => {
  const proven = Object.values(templates).filter((t) => t.inputs.some((i) => i.kind === 'field'));

  for (const template of proven) {
    it(`${template.id}: one field renders the template as before; several leave no placeholder`, () => {
      const single = inputsFor(template, (spec, names) => [names[0]]);
      const asString = inputsFor(template, (spec, names) => names[0]);
      expect(generateFiles(template, single, KNOWLEDGE, '2026-10-04')).toEqual(
        generateFiles(template, asString, KNOWLEDGE, '2026-10-04'),
      );

      const many = inputsFor(template, (spec, names) =>
        isMultiField(template.id, spec.id) ? names.slice(0, 2) : [names[0]],
      );
      const out = Object.values(generateFiles(template, many, KNOWLEDGE, '2026-10-04')).join('\n');
      expect(out).not.toMatch(/{{/);
    });
  }

  it('Infobasic VVR checks any of the selected fields', () => {
    const t = templates['infobasic/vvr'];
    const out = generateFiles(
      t,
      inputsFor(t, () => ['SC.NAME', 'SC.SECTOR']),
      KNOWLEDGE,
      '2026-10-04',
    )['V.SAMPLE.CHECK.b'];
    expect(out).toContain(
      `    Y.CHECKED = 0
    IF AF EQ SC.NAME THEN Y.CHECKED = 1
    IF AF EQ SC.SECTOR THEN Y.CHECKED = 1
    IF NOT(Y.CHECKED) THEN RETURN
    IF COMI EQ '' THEN`,
    );
  });

  it('OFS routines set every selected field in one message', () => {
    const t = templates['infobasic/ofs-routine'];
    const files = generateFiles(
      t,
      inputsFor(t, () => ['SC.NAME', 'SC.TOWN']),
      KNOWLEDGE,
      '2026-10-04',
    );
    expect(Object.values(files).join('\n')).toContain(
      `,NAME:1:1=':Y.NEW.VALUE:',TOWN:1:1=':Y.NEW.VALUE\n`,
    );
  });

  it('Java validateRecord flags each empty field', () => {
    const t = templates['java/record-lifecycle-validate'];
    const out = Object.values(
      generateFiles(
        t,
        inputsFor(t, () => ['SC.NAME', 'SC.SECTOR']),
        KNOWLEDGE,
        '2026-10-04',
      ),
    ).join('\n');
    expect(out).toContain('String valueName = rec.getName().getValue();');
    expect(out).toContain('rec.getSector().setError(');
  });

  it('refuses several fields for a single-field input', () => {
    const t = templates['infobasic/var'];
    const inputs = inputsFor(t, (spec, names) => names.slice(0, 2));
    expect(() => generateFiles(t, inputs, KNOWLEDGE, '2026-10-04')).toThrow(/takes one field/);
  });
});
