import { describe, expect, it } from 'vitest';
import {
  generateEvalQuery as creatorEvalQuery,
  generateRoutine as creatorRoutine,
} from '../../services/temenos/routineGenerator';
import { generateEvalQuery, generateRoutine, resolveApplication } from './builderGenerator';

// Synthetic knowledge: one catalog application and one that is not in the 16-entry catalog.
const KNOWLEDGE = {
  release: 'RTEST',
  apps: {
    ACCOUNT: { prefix: 'AC.', recordClass: 'Account', components: [], fields: [] },
    'AA.ARRANGEMENT': {
      prefix: 'AA.ARR.',
      recordClass: 'AaArrangement',
      components: [],
      fields: [[5, 'AA.ARR.ARR.STATUS', 'AaArrangement_ArrStatus', null, null, null, 'SV']],
    },
  },
};

const CATALOG_SPEC = {
  routineName: 'acct.extract',
  developer: 'tester',
  purpose: 'Extract',
  tables: ['ACCOUNT', 'CUSTOMER$HIS'],
  fields: [
    { name: 'AC.CUSTOMER', table: 'ACCOUNT', position: 1 },
    { name: 'EB.CUS.SECTOR', table: 'CUSTOMER', position: 23 },
    { name: 'AC.CATEGORY', table: 'ACCOUNT', position: null },
  ],
  functions: ['Fread', 'Fwrite', 'Trim'],
  concat: true,
  separator: '|',
  clearFields: true,
};

describe('builder generator', () => {
  it('generates exactly what the Routine Creator does for catalog applications', () => {
    expect(generateRoutine(CATALOG_SPEC, KNOWLEDGE)).toBe(creatorRoutine(CATALOG_SPEC));
    expect(generateRoutine(CATALOG_SPEC)).toBe(creatorRoutine(CATALOG_SPEC));
    expect(generateEvalQuery('ACCOUNT', ['AC.CUSTOMER', 'AC.CATEGORY'], '^', KNOWLEDGE)).toBe(
      creatorEvalQuery('ACCOUNT', ['AC.CUSTOMER', 'AC.CATEGORY'], '^'),
    );
  });

  it('keeps the catalog alias of a catalog application even when a knowledge file is loaded', () => {
    expect(resolveApplication('ACCOUNT', KNOWLEDGE).recordVar).toBe('R.ACC');
  });

  it('derives the variable names of an application that is only in the knowledge file', () => {
    expect(resolveApplication('AA.ARRANGEMENT', KNOWLEDGE)).toMatchObject({
      name: 'AA.ARRANGEMENT',
      fieldPrefix: 'AA.ARR.',
      recordVar: 'R.AA.ARRANGEMENT',
      fileNameVariable: 'FN.AA.ARRANGEMENT',
      fileVariable: 'F.AA.ARRANGEMENT',
      errorVariable: 'E.AA.ARRANGEMENT',
      idVariable: 'Y.AA.ARRANGEMENT.ID',
      hasLayoutInsert: true,
    });
    expect(resolveApplication('AA.ARRANGEMENT')).toBeNull();
    expect(resolveApplication('NOT.AN.APP', KNOWLEDGE)).toBeNull();
  });

  it('opens, reads, writes and extracts fields of a knowledge-only application', () => {
    const output = generateRoutine(
      {
        routineName: 'AA.EXTRACT',
        tables: [{ application: 'AA.ARRANGEMENT', suffix: '$NAU' }],
        fields: [{ name: 'AA.ARR.ARR.STATUS', table: 'AA.ARRANGEMENT', position: 5 }],
        functions: ['Fread', 'Fwrite'],
      },
      KNOWLEDGE,
    );
    expect(output).toContain('    $INSERT I_F.AA.ARRANGEMENT');
    expect(output).toContain('    FN.AA.ARRANGEMENT = "F.AA.ARRANGEMENT$NAU"');
    expect(output).toContain('    CALL OPF(FN.AA.ARRANGEMENT,F.AA.ARRANGEMENT)');
    expect(output).toContain(
      '    CALL F.READ(FN.AA.ARRANGEMENT,Y.AA.ARRANGEMENT.ID,R.AA.ARRANGEMENT,F.AA.ARRANGEMENT,E.AA.ARRANGEMENT)',
    );
    expect(output).toContain(
      '    CALL F.WRITE(FN.AA.ARRANGEMENT,Y.AA.ARRANGEMENT.ID,R.AA.ARRANGEMENT)',
    );
    expect(output).toContain('    Y.AA.ARR.ARR.STATUS = R.AA.ARRANGEMENT<5>');
  });

  it('leaves out an application that is neither in the catalog nor in the knowledge file', () => {
    const output = generateRoutine({ tables: ['AA.ARRANGEMENT'] });
    expect(output).toContain('    * No application tables selected');
  });

  it('strips the knowledge prefix of the selected application in the EVAL query', () => {
    expect(generateEvalQuery('AA.ARRANGEMENT', ['AA.ARR.ARR.STATUS'], '^', KNOWLEDGE)).toBe(
      'SELECT FBNK.AA.ARRANGEMENT SAVING EVAL "ARR.STATUS"',
    );
  });
});
