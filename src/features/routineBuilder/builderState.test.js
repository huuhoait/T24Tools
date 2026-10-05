import { describe, expect, it } from 'vitest';
import { createRoutineCreatorState } from '../routineCreator/routineCreatorState';
import {
  buildBuilderEvalQuery,
  changeTableApplication,
  setTableFields,
  validateBuilderState,
} from './builderState';

const KNOWLEDGE = {
  release: 'RTEST',
  apps: {
    'SAMPLE.CUSTOMER': {
      prefix: 'SC.',
      fields: [
        [1, 'SC.NAME', 'SampleCustomer_Name', 'TField', 'Yes', null, 'SV'],
        [2, 'SC.LINES', 'SampleCustomer_Lines', null, null, null, 'MV'],
      ],
    },
    ACCOUNT: {
      prefix: 'AC.',
      fields: [[1, 'AC.CUSTOMER', 'Account_Customer', null, null, null, 'SV']],
    },
  },
};

const state = (patch = {}) => ({ ...createRoutineCreatorState(), ...patch });

describe('setTableFields', () => {
  it('replaces the fields of one application, with positions from the knowledge file', () => {
    const fields = [
      { name: 'AC.CUSTOMER', table: 'ACCOUNT', position: '1' },
      { name: 'SC.LINES', table: 'SAMPLE.CUSTOMER', position: '2' },
    ];
    expect(setTableFields(fields, 'SAMPLE.CUSTOMER', ['SC.NAME', 'SC.LINES'], KNOWLEDGE)).toEqual([
      { name: 'AC.CUSTOMER', table: 'ACCOUNT', position: '1' },
      { name: 'SC.NAME', table: 'SAMPLE.CUSTOMER', position: '1' },
      { name: 'SC.LINES', table: 'SAMPLE.CUSTOMER', position: '2' },
    ]);
    expect(setTableFields(fields, 'SAMPLE.CUSTOMER', [], KNOWLEDGE)).toEqual([fields[0]]);
  });
});

describe('changeTableApplication', () => {
  it('sets the application and clears the fields chosen for the old one', () => {
    const before = state({
      tables: [{ application: 'SAMPLE.CUSTOMER', suffix: '$HIS' }],
      fields: [{ name: 'SC.NAME', table: 'SAMPLE.CUSTOMER', position: '1' }],
    });
    const after = changeTableApplication(before, 0, 'ACCOUNT');
    expect(after.tables).toEqual([{ application: 'ACCOUNT', suffix: '$HIS' }]);
    expect(after.fields).toEqual([]);
  });

  it('keeps the fields while another table still uses the old application', () => {
    const before = state({
      tables: [
        { application: 'SAMPLE.CUSTOMER', suffix: '' },
        { application: 'SAMPLE.CUSTOMER', suffix: '$HIS' },
      ],
      fields: [{ name: 'SC.NAME', table: 'SAMPLE.CUSTOMER', position: '1' }],
    });
    expect(changeTableApplication(before, 1, 'ACCOUNT').fields).toEqual(before.fields);
  });
});

describe('validateBuilderState', () => {
  it('accepts any application of the loaded release', () => {
    const result = validateBuilderState(
      state({ tables: [{ application: 'SAMPLE.CUSTOMER', suffix: '' }] }),
      KNOWLEDGE,
    );
    expect(result.errors).toEqual([]);
  });

  it('names an application the release does not have, even a built-in catalog one', () => {
    const missing = validateBuilderState(
      state({ tables: [{ application: 'CUSTOMER', suffix: '' }] }),
      KNOWLEDGE,
    );
    expect(missing.errors).toEqual(['CUSTOMER is not an application in RTEST.']);

    const result = validateBuilderState(
      state({ tables: [{ application: 'SAMPLE.CUST', suffix: '' }] }),
      KNOWLEDGE,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('SAMPLE.CUST is not an application in RTEST.');
  });

  it('without a knowledge file, names an application outside the built-in catalog', () => {
    const result = validateBuilderState(
      state({ tables: [{ application: 'SAMPLE.CUSTOMER', suffix: '' }] }),
    );
    expect(result.errors).toContain(
      'SAMPLE.CUSTOMER is not in the built-in catalog. Load a knowledge file to use it.',
    );
  });
});

describe('buildBuilderEvalQuery', () => {
  it('uses the first table and strips its knowledge prefix', () => {
    const query = buildBuilderEvalQuery(
      state({
        evalQuery: true,
        tables: [{ application: 'SAMPLE.CUSTOMER', suffix: '' }],
        fields: [{ name: 'SC.NAME', table: 'SAMPLE.CUSTOMER', position: '1' }],
      }),
      KNOWLEDGE,
    );
    expect(query).toBe('SELECT FBNK.SAMPLE.CUSTOMER SAVING EVAL "NAME"');
  });
});
