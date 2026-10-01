import { describe, expect, it } from 'vitest';
import { parseRoutine, routineFileError } from '../routineImport';

// A real-style legacy T24 routine: banner comments, $INSERTs, FN/F file variables opened with OPF,
// GOSUB paragraphs, F.READ / F.WRITE, field access by position and by layout equate, a call to a
// helper routine and an application that is not in the Routine Creator catalog.
const SAMPLE = [
  '*-----------------------------------------------------------------------------',
  '*  Developed By          : Zain Kamali',
  '*  Purpose               : Extract account balances for the GL report',
  '*-----------------------------------------------------------------------------',
  '',
  '    SUBROUTINE ACCOUNT.EXTRACT',
  '',
  '    $INSERT I_COMMON',
  '    $INSERT I_EQUATE',
  '    $INSERT I_F.ACCOUNT',
  '    $INSERT I_F.CUSTOMER',
  '    $INSERT T24.BP I_F.AA.ARRANGEMENT',
  '',
  '    GOSUB INIT',
  '    GOSUB OPENFILE',
  '    GOSUB PROCESS',
  '',
  '    RETURN',
  '',
  '********',
  'INIT:',
  '********',
  '    FN.ACC = "F.ACCOUNT"',
  '    F.ACC = ""',
  "    FN.CUS.HIS = 'F.CUSTOMER$HIS'",
  '    F.CUS.HIS = ""',
  '    FN.AA = "F.AA.ARRANGEMENT"',
  '    F.AA = ""',
  '    RETURN',
  '',
  'OPENFILE:',
  '    CALL OPF(FN.ACC,F.ACC)',
  '    CALL OPF(FN.CUS.HIS,F.CUS.HIS)',
  '    CALL OPF(FN.AA,F.AA)',
  '    RETURN',
  '',
  'PROCESS:',
  '* Read the account and copy its balance',
  '    CALL F.READ(FN.ACC,Y.ACC.ID,R.ACC,F.ACC,E.ACC)',
  '    Y.CUSTOMER = R.ACC<1>',
  '    Y.BALANCE = R.ACC<AC.ONLINE.ACTUAL.BAL>',
  '    CALL F.READ(FN.CUS.HIS,Y.CUSTOMER,R.CUS,F.CUS.HIS,E.CUS)',
  '    Y.NAME = R.CUS<EB.CUS.SHORT.NAME>',
  '    Y.STATUS = R.NEW(AC.ACCOUNT.TITLE.1)',
  '    CALL ACCOUNT.EXTRACT.HELPER(Y.ACC.ID, Y.BALANCE)',
  '    CALL F.WRITE(FN.ACC,Y.ACC.ID,R.ACC)',
  '    CALL JOURNAL.UPDATE(Y.ACC.ID)',
  '    RETURN',
  '',
  'END',
].join('\n');

describe('parseRoutine', () => {
  const result = parseRoutine(SAMPLE, 'ACCOUNT.EXTRACT.b');

  it('reads the routine name and kind from the SUBROUTINE header', () => {
    expect(result.name).toBe('ACCOUNT.EXTRACT');
    expect(result.kind).toBe('SUBROUTINE');
    expect(result.state.routineName).toBe('ACCOUNT.EXTRACT');
  });

  it('reads developer and purpose from the header comments', () => {
    expect(result.state.developer).toBe('Zain Kamali');
    expect(result.state.purpose).toBe('Extract account balances for the GL report');
  });

  it('maps catalog applications from F.<APP> opens and $INSERT I_F.<APP>, with suffixes', () => {
    expect(result.state.tables).toEqual([
      { application: 'ACCOUNT', suffix: '' },
      { application: 'CUSTOMER', suffix: '$HIS' },
    ]);
  });

  it('reports applications that are not in the catalog instead of dropping them silently', () => {
    expect(result.unmapped).toContain(
      'Application AA.ARRANGEMENT is not in the Routine Creator catalog.',
    );
  });

  it('selects the F.READ and F.WRITE snippets when the routine uses them', () => {
    expect(result.state.functions).toEqual(['Fread', 'Fwrite']);
  });

  it('keeps a field position only when the source states it, and never invents one', () => {
    expect(result.state.fields).toEqual([
      { name: 'CUSTOMER', table: 'ACCOUNT', position: '1' },
      { name: 'AC.ONLINE.ACTUAL.BAL', table: 'ACCOUNT', position: '' },
      { name: 'EB.CUS.SHORT.NAME', table: 'CUSTOMER', position: '' },
    ]);
  });

  it('reports what the creator model cannot represent', () => {
    expect(result.calls).toEqual(['ACCOUNT.EXTRACT.HELPER']);
    expect(result.unmapped).toContain(
      'CALL ACCOUNT.EXTRACT.HELPER is not represented by the creator.',
    );
    expect(result.unmapped).toContain(
      'R.NEW / R.OLD field access (AC.ACCOUNT.TITLE.1) is not mapped: the application is not stated in the source.',
    );
    expect(result.unmapped).toContain('Paragraph OPENFILE is not represented by the creator.');
    expect(result.unmapped.some((m) => /Paragraph (INIT|PROCESS)\b/.test(m))).toBe(false);
  });

  it('lists what it mapped', () => {
    expect(result.mapped).toEqual([
      'Routine name ACCOUNT.EXTRACT',
      'Developer Zain Kamali',
      'Purpose Extract account balances for the GL report',
      'Table ACCOUNT',
      'Table CUSTOMER$HIS',
      'F.READ',
      'F.WRITE',
      'Field CUSTOMER (ACCOUNT, position 1)',
      'Field AC.ONLINE.ACTUAL.BAL (ACCOUNT, position not stated)',
      'Field EB.CUS.SHORT.NAME (CUSTOMER, position not stated)',
    ]);
  });

  it('leaves the other creator settings at their defaults', () => {
    expect(result.state).toMatchObject({
      template: '',
      concat: false,
      clearFields: false,
      evalQuery: false,
    });
  });
});

describe('parseRoutine edge cases', () => {
  it('reads PROGRAM and FUNCTION headers and reports that the creator generates a SUBROUTINE', () => {
    const program = parseRoutine('    PROGRAM BATCH.RUN\n    CRT "HI"\nEND');
    expect(program).toMatchObject({ name: 'BATCH.RUN', kind: 'PROGRAM' });
    expect(program.unmapped).toContain(
      'PROGRAM header: the Routine Creator generates a SUBROUTINE.',
    );
    const fn = parseRoutine('FUNCTION CALC.FEE(AMOUNT)\nRETURN(AMOUNT)\nEND');
    expect(fn).toMatchObject({ name: 'CALC.FEE', kind: 'FUNCTION' });
  });

  it('reads lower-case routine names and CRLF sources', () => {
    const result = parseRoutine(
      '* Author : A. Dev\r\n    subroutine acct.check\r\n    $INSERT I_F.ACCOUNT\r\nEND\r\n',
    );
    expect(result.name).toBe('acct.check');
    expect(result.state.developer).toBe('A. Dev');
    expect(result.state.tables).toEqual([{ application: 'ACCOUNT', suffix: '' }]);
  });

  it('does not take a header from a comment', () => {
    const result = parseRoutine('* SUBROUTINE OLD.NAME\n    SUBROUTINE NEW.NAME\nEND');
    expect(result.name).toBe('NEW.NAME');
  });

  it('falls back to the file name and reports a missing header', () => {
    const result = parseRoutine('    CRT "no header"', 'BP/LEGACY.JOB.b');
    expect(result.name).toBe('LEGACY.JOB');
    expect(result.kind).toBeNull();
    expect(result.unmapped).toContain(
      'No SUBROUTINE, PROGRAM or FUNCTION header found; the name was taken from the file name.',
    );
  });

  it('handles an empty file without inventing a table', () => {
    const result = parseRoutine('');
    expect(result.name).toBe('');
    expect(result.state.tables).toEqual([]);
    expect(result.unmapped).toContain('No SUBROUTINE, PROGRAM or FUNCTION header found.');
    expect(result.unmapped).toContain('No application table from the catalog was found.');
  });

  it('reports a name the creator cannot use', () => {
    const result = parseRoutine('SUBROUTINE ACC$CHECK\nEND');
    expect(result.name).toBe('ACC$CHECK');
    expect(result.unmapped).toContain(
      'Routine name ACC$CHECK contains characters the creator does not accept.',
    );
  });

  it('ignores commented-out code', () => {
    const result = parseRoutine(
      'SUBROUTINE X.Y\n* CALL F.WRITE(FN.ACC,ID,R.ACC)\n*    $INSERT I_F.TELLER\nEND',
    );
    expect(result.state.functions).toEqual([]);
    expect(result.state.tables).toEqual([]);
  });
});

describe('routineFileError', () => {
  it('accepts text routines up to 1 MB', () => {
    expect(routineFileError('SUBROUTINE A.B', 14)).toBeNull();
    expect(routineFileError('', 0)).toBeNull();
  });

  it('rejects binary files and files over 1 MB', () => {
    expect(routineFileError('MZ\u0000\u0001', 4)).toBe(
      'This file is not a text routine (it contains binary data).',
    );
    expect(routineFileError('x', 1_048_577)).toBe(
      'This file is larger than 1 MB; T24 routines are text files far below that size.',
    );
  });
});
