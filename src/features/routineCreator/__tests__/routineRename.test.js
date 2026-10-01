import { describe, expect, it } from 'vitest';
import { renameRoutine, validateNewName } from '../routineRename';

const SAMPLE = [
  '*-----------------------------------------------------------------------------',
  '*  Program     : ACCOUNT.EXTRACT',
  '*  Developed By: Zain Kamali',
  '*-----------------------------------------------------------------------------',
  '    SUBROUTINE ACCOUNT.EXTRACT',
  '    $INSERT I_COMMON',
  '    $INSERT I_EQUATE',
  '    $INSERT I_F.ACCOUNT',
  '    $INSERT I_ACCOUNT.EXTRACT',
  '',
  '    GOSUB INIT',
  '    RETURN',
  '',
  'INIT:',
  '    FN.ACCOUNT.EXTRACT = "F.ACCOUNT.EXTRACT.LOG"',
  '    CALL ACCOUNT.EXTRACT.HELPER(Y.ID)',
  '    CALL OTHER.ACCOUNT.EXTRACT(Y.ID)',
  '    CRT "ACCOUNT.EXTRACT finished"',
  '    CALL ACCOUNT.EXTRACT ;* recursive call to itself',
  '    RETURN',
  'END',
].join('\n');

describe('renameRoutine', () => {
  const result = renameRoutine(SAMPLE, 'ACCOUNT.EXTRACT', 'ACCOUNT.EXTRACT.V2');

  it('renames the SUBROUTINE header', () => {
    expect(result.text).toContain('    SUBROUTINE ACCOUNT.EXTRACT.V2\n');
  });

  it('does not touch other routines whose names contain the old name', () => {
    expect(result.text).toContain('    CALL ACCOUNT.EXTRACT.HELPER(Y.ID)');
    expect(result.text).toContain('    CALL OTHER.ACCOUNT.EXTRACT(Y.ID)');
  });

  it('does not touch variables, inserts or file names that contain the old name', () => {
    expect(result.text).toContain('    FN.ACCOUNT.EXTRACT = "F.ACCOUNT.EXTRACT.LOG"');
    expect(result.text).toContain('    $INSERT I_ACCOUNT.EXTRACT');
  });

  it("renames the routine's own name in comments, strings and a call to itself", () => {
    expect(result.text).toContain('*  Program     : ACCOUNT.EXTRACT.V2');
    expect(result.text).toContain('    CRT "ACCOUNT.EXTRACT.V2 finished"');
    expect(result.text).toContain('    CALL ACCOUNT.EXTRACT.V2 ;* recursive call to itself');
  });

  it('lists every changed line with its number, before and after', () => {
    expect(result.changes).toEqual([
      {
        line: 2,
        before: '*  Program     : ACCOUNT.EXTRACT',
        after: '*  Program     : ACCOUNT.EXTRACT.V2',
      },
      {
        line: 5,
        before: '    SUBROUTINE ACCOUNT.EXTRACT',
        after: '    SUBROUTINE ACCOUNT.EXTRACT.V2',
      },
      {
        line: 18,
        before: '    CRT "ACCOUNT.EXTRACT finished"',
        after: '    CRT "ACCOUNT.EXTRACT.V2 finished"',
      },
      {
        line: 19,
        before: '    CALL ACCOUNT.EXTRACT ;* recursive call to itself',
        after: '    CALL ACCOUNT.EXTRACT.V2 ;* recursive call to itself',
      },
    ]);
  });

  it('keeps everything else byte for byte', () => {
    const unchanged = (text) => text.split('\n').filter((_, i) => ![1, 4, 17, 18].includes(i));
    expect(unchanged(result.text)).toEqual(unchanged(SAMPLE));
  });

  it('renames a name at the end of a sentence', () => {
    const { text } = renameRoutine(
      '* Called by ACCOUNT.EXTRACT.\nSUBROUTINE ACCOUNT.EXTRACT',
      'ACCOUNT.EXTRACT',
      'NEW.ONE',
    );
    expect(text).toBe('* Called by NEW.ONE.\nSUBROUTINE NEW.ONE');
  });

  it('keeps CRLF line endings', () => {
    const { text, changes } = renameRoutine(
      'SUBROUTINE OLD.R\r\n    CALL OLD.R.SUB\r\nEND\r\n',
      'OLD.R',
      'NEW.R',
    );
    expect(text).toBe('SUBROUTINE NEW.R\r\n    CALL OLD.R.SUB\r\nEND\r\n');
    expect(changes).toEqual([{ line: 1, before: 'SUBROUTINE OLD.R', after: 'SUBROUTINE NEW.R' }]);
  });

  it('renames PROGRAM and FUNCTION headers, and is case-sensitive', () => {
    expect(renameRoutine('PROGRAM BATCH.RUN\nEND', 'BATCH.RUN', 'BATCH.RUN2').text).toBe(
      'PROGRAM BATCH.RUN2\nEND',
    );
    expect(
      renameRoutine('FUNCTION CALC.FEE(AMT)\n* calc.fee helper\nEND', 'CALC.FEE', 'CALC.CHARGE')
        .text,
    ).toBe('FUNCTION CALC.CHARGE(AMT)\n* calc.fee helper\nEND');
  });

  it('changes nothing without a name to replace', () => {
    expect(renameRoutine('SUBROUTINE A.B\nEND', '', 'C.D')).toEqual({
      text: 'SUBROUTINE A.B\nEND',
      changes: [],
    });
  });

  it('treats special characters in names literally', () => {
    const { text } = renameRoutine('SUBROUTINE ACC$CHK\nCALL ACCXCHK', 'ACC$CHK', 'ACC.CHK2');
    expect(text).toBe('SUBROUTINE ACC.CHK2\nCALL ACCXCHK');
  });
});

describe('validateNewName', () => {
  it('accepts a T24 routine name that differs from the current one', () => {
    expect(validateNewName('ACCOUNT.EXTRACT.V2', 'ACCOUNT.EXTRACT')).toBeNull();
  });

  it('explains what is wrong otherwise', () => {
    expect(validateNewName('  ', 'A.B')).toBe('Enter a new routine name.');
    expect(validateNewName('2ND.ROUTINE', 'A.B')).toBe(
      'Routine name must start with a letter and contain only letters, numbers, underscores, or dots.',
    );
    expect(validateNewName('MY ROUTINE', 'A.B')).toMatch(/^Routine name must/);
    expect(validateNewName('A.B', 'A.B')).toBe('The new name is the same as the current name.');
  });
});
