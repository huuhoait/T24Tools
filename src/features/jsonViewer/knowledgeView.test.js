import { describe, expect, it } from 'vitest';
import { isKnowledgeFile, knowledgeSummary, searchFields } from './knowledgeView';

const DOC = {
  release: 'RTEST',
  schemaVersion: 3,
  apps: {
    'SAMPLE.CUSTOMER': {
      fields: [
        [1, 'SC.NAME', 'Sample_Name', null, null, 'SM.Sample.SampleCustomer.ScName', 'SV'],
        [2, 'SC.LINES', 'Sample_Lines', null, null, null, 'MV'],
      ],
    },
    'SAMPLE.ACCOUNT': { fields: [[1, 'SA.NAME', 'Acct_Name', null, null, null, 'SV']] },
  },
};

describe('knowledge view', () => {
  it('recognises a knowledge file and nothing else', () => {
    expect(isKnowledgeFile(DOC)).toBe(true);
    expect(isKnowledgeFile({ apps: {} })).toBe(false);
    expect(isKnowledgeFile({ apps: [] })).toBe(false);
    expect(isKnowledgeFile({ apps: { X: { name: 1 } } })).toBe(false);
    expect(isKnowledgeFile(null)).toBe(false);
  });

  it('summarises apps and fields', () => {
    expect(knowledgeSummary(DOC)).toEqual({
      release: 'RTEST',
      schemaVersion: 3,
      appCount: 2,
      fieldCount: 3,
    });
  });

  it('finds fields by name or jBC name across apps', () => {
    expect(searchFields(DOC, 'name').results).toEqual([
      { app: 'SAMPLE.CUSTOMER', position: 1, name: 'SC.NAME' },
      { app: 'SAMPLE.ACCOUNT', position: 1, name: 'SA.NAME' },
    ]);
    expect(searchFields(DOC, 'ScName').total).toBe(1);
    expect(searchFields(DOC, 'n').total).toBe(0); // too short to be useful
    expect(searchFields(DOC, 'name', 1)).toEqual({
      results: [{ app: 'SAMPLE.CUSTOMER', position: 1, name: 'SC.NAME' }],
      total: 2,
    });
  });
});
