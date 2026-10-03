import { describe, expect, it } from 'vitest';
import TEMPLATES from '../../data/templates.json';
import { FieldNotAvailable, MissingInputs, render, resolve } from './render';

// Build the smallest knowledge file that contains exactly the fields one golden case uses,
// from the values Temenos-Skills resolved for it (no Temenos data is bundled for this test).
function knowledgeForGolden(template, release) {
  const { userInputs, resolved } = template.golden;
  const apps = {};
  for (const input of template.inputs.filter((i) => i.kind === 'app' && userInputs[i.id])) {
    apps[userInputs[input.id].toUpperCase()] = {
      prefix: '',
      recordClass: resolved[release][`${input.id}_CLASS`],
      components: [],
      fields: [],
    };
  }
  for (const input of template.inputs.filter((i) => i.kind === 'field' && userInputs[i.id])) {
    const app = apps[userInputs[input.of].toUpperCase()];
    const equ = userInputs[input.id].toUpperCase();
    const shortName = resolved[release][`${input.id}_NAME`];
    app.prefix = equ.slice(0, equ.length - shortName.length);
    const value = resolved[release][input.id];
    const alias =
      template.language === 'java' ? `${app.recordClass}_${value}` : `${app.recordClass}_X`;
    const jbc = template.language === 'jbc' ? value : null;
    app.fields.push([1, equ, alias, null, null, jbc, 'SV']);
  }
  return { release, schemaVersion: 3, apps };
}

const proven = Object.values(TEMPLATES.templates);

describe('render.js matches the Python renderer (Temenos-Skills artefact_templates.py)', () => {
  it('bundles all 25 proven templates', () => {
    expect(proven).toHaveLength(25);
  });

  for (const template of proven) {
    for (const release of Object.keys(template.golden.resolved)) {
      it(`${template.id} on ${release}: same resolved values and byte-identical golden output`, () => {
        const knowledge = knowledgeForGolden(template, release);
        const values = resolve(
          template,
          template.golden.userInputs,
          knowledge,
          template.golden.today,
        );
        expect(values).toEqual(template.golden.resolved[release]);
        expect(render(template, values)).toEqual(template.golden.output);
      });
    }
  }
});

describe('resolve / render rules', () => {
  const java = TEMPLATES.templates['java/record-lifecycle-validate'];
  const jbc = TEMPLATES.templates['jbc/validation'];
  const knowledge = {
    release: 'R25',
    schemaVersion: 3,
    apps: {
      CUSTOMER: {
        prefix: 'EB.CUS.',
        recordClass: 'Customer',
        components: ['ST.Customer'],
        fields: [
          [
            1,
            'EB.CUS.MNEMONIC',
            'Customer_Mnemonic',
            'TField',
            'Yes',
            'ST.Customer.Customer.EbCusMnemonic',
            'SV',
          ],
          [
            2,
            'EB.CUS.SHORT.NAME',
            'Customer_ShortName',
            null,
            null,
            'ST.Customer.Customer.EbCusShortName',
            'MV',
          ],
          [3, 'EB.CUS.NO.JBC', 'Customer_NoJbc', null, null, null, null],
        ],
      },
    },
  };
  const base = { JAVA_PACKAGE: 'p', CLASS_NAME: 'C', APP: 'CUSTOMER', ERROR_TEXT: 'E' };

  it('refuses a multi-value field for Java', () => {
    expect(() => resolve(java, { ...base, FIELD: 'EB.CUS.SHORT.NAME' }, knowledge, 'd')).toThrow(
      FieldNotAvailable,
    );
    expect(() => resolve(java, { ...base, FIELD: 'EB.CUS.SHORT.NAME' }, knowledge, 'd')).toThrow(
      /multi-value/,
    );
  });

  it('refuses a field with no getter for Java, and no jBC name for jBC', () => {
    expect(() => resolve(java, { ...base, FIELD: 'EB.CUS.NO.JBC' }, knowledge, 'd')).toThrow(
      /no single-value getter/,
    );
    const inputs = {
      PACKAGE: 'P.X',
      ROUTINE_NAME: 'R',
      METHOD_NAME: 'm',
      DESCRIPTION: 'd',
      AUTHOR: 'a',
      APP: 'CUSTOMER',
      FIELD: 'EB.CUS.NO.JBC',
      ERROR_TEXT: 'E',
    };
    expect(() => resolve(jbc, inputs, knowledge, 'd')).toThrow(/no componentised \(jBC\) name/);
  });

  it('refuses a field that is not in the release', () => {
    expect(() => resolve(java, { ...base, FIELD: 'EB.CUS.NOPE' }, knowledge, 'd')).toThrow(
      /not a field of CUSTOMER/,
    );
  });

  it('never renders an unfilled placeholder', () => {
    expect(() => render(java, { CLASS_NAME: 'C' })).toThrow(MissingInputs);
    try {
      render(java, { CLASS_NAME: 'C' });
    } catch (error) {
      expect(error.missing).toContain('JAVA_PACKAGE');
    }
  });
});

describe('localIsoDate', () => {
  it('uses the local calendar day, not UTC (01:00 on 3 Oct local is still 3 Oct)', async () => {
    const { localIsoDate } = await import('./render');
    expect(localIsoDate(new Date(2026, 9, 3, 1, 0))).toBe('2026-10-03');
    expect(localIsoDate(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09');
  });
});
