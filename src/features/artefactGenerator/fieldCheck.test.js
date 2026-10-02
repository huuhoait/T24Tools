import { describe, expect, it } from 'vitest';
import { checkFields, extractRefs } from './fieldCheck';

const knowledge = {
  release: 'R23',
  apps: {
    ACCOUNT: {
      prefix: 'AC.',
      recordClass: 'Account',
      fields: [
        [
          1,
          'AC.CUSTOMER',
          'Account_Customer',
          null,
          null,
          'AC.AccountOpening.Account.Customer',
          'SV',
        ],
        [
          2,
          'AC.CATEGORY',
          'Account_Category',
          null,
          null,
          'AC.AccountOpening.Account.Category',
          'SV',
        ],
        [3, 'AC.ACCOUNT.TITLE.1', 'Account_AccountTitle1', null, null, null, 'MV'],
      ],
    },
  },
};

describe('extractRefs (same rules as Temenos-Skills artefact_fields.py)', () => {
  it('finds legacy EQU names', () => {
    const refs = extractRefs(
      'lvCat = R.NEW(AC.CATEGORY)\nlvT = R.NEW(AC.ACCOUNT.TITLE.1)\n',
      'AC.',
      'Account',
    );
    expect([...refs.legacy].sort()).toEqual(['AC.ACCOUNT.TITLE.1', 'AC.CATEGORY']);
  });

  it('finds componentised names but skips method calls', () => {
    const src =
      'x = EB.SystemTables.getRNew(AC.AccountOpening.Account.Category)\nr = AC.AccountOpening.Account.Read(id, err)\n';
    expect([...extractRefs(src, 'AC.', 'Account').componentised]).toEqual([
      'AC.AccountOpening.Account.Category',
    ]);
  });

  it('ignores comment lines', () => {
    expect([...extractRefs('* uses AC.NOT.A.FIELD\nRETURN\n', 'AC.', 'Account').legacy]).toEqual(
      [],
    );
  });
});

describe('checkFields', () => {
  it('verifies known names and reports unknown ones', () => {
    const src =
      'a = R.NEW(AC.CATEGORY)\nb = R.NEW(AC.CATEGORYY)\nc = AC.AccountOpening.Account.Customer\nd = AC.AccountOpening.Account.Nope\n';
    const result = checkFields(knowledge, 'ACCOUNT', src);
    expect(result.verified).toEqual(['AC.AccountOpening.Account.Customer', 'AC.CATEGORY']);
    expect(result.missing).toEqual(['AC.AccountOpening.Account.Nope', 'AC.CATEGORYY']);
  });

  it('reports an unknown app instead of passing', () => {
    expect(checkFields(knowledge, 'ACCOUT', 'RETURN').error).toMatch(/ACCOUT/);
  });
});
