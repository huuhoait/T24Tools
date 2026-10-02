import { describe, expect, it } from 'vitest';
import { fieldsFor, listApps } from './catalog';

const knowledge = {
  release: 'R23',
  apps: {
    CUSTOMER: {
      prefix: 'EB.CUS.',
      recordClass: 'Customer',
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
        [3, 'EB.CUS.LEGACY.ONLY', 'Customer_LegacyOnly', null, null, null, null],
      ],
    },
    'CUSTOMER.STATUS': { prefix: 'EB.CST.', recordClass: 'CustomerStatus', fields: [] },
    'AA.CUSTOMER.DETAILS': { prefix: 'AA.', recordClass: 'AaCustomerDetails', fields: [] },
    ACCOUNT: { prefix: 'AC.', recordClass: 'Account', fields: [] },
  },
};

describe('listApps', () => {
  it('matches case-insensitively and ranks prefix matches first', () => {
    expect(listApps(knowledge, 'cust')).toEqual([
      'CUSTOMER',
      'CUSTOMER.STATUS',
      'AA.CUSTOMER.DETAILS',
    ]);
  });

  it('returns everything (sorted) for an empty query, capped by limit', () => {
    expect(listApps(knowledge, '', 2)).toEqual(['AA.CUSTOMER.DETAILS', 'ACCOUNT']);
  });
});

describe('fieldsFor', () => {
  const byName = (list) => Object.fromEntries(list.map((f) => [f.name, f]));

  it('infobasic offers every field', () => {
    const f = byName(fieldsFor(knowledge, 'CUSTOMER', 'infobasic'));
    expect(Object.values(f).every((x) => !x.disabled)).toBe(true);
    expect(f['EB.CUS.SHORT.NAME'].kind).toBe('MV');
  });

  it('jbc disables fields without a componentised name and shows the jBC name', () => {
    const f = byName(fieldsFor(knowledge, 'CUSTOMER', 'jbc'));
    expect(f['EB.CUS.MNEMONIC'].code).toBe('ST.Customer.Customer.EbCusMnemonic');
    expect(f['EB.CUS.LEGACY.ONLY'].disabled).toBe('no jBC name in R23');
  });

  it('java disables multi-value and getter-less fields and shows the getter', () => {
    const f = byName(fieldsFor(knowledge, 'CUSTOMER', 'java'));
    expect(f['EB.CUS.MNEMONIC'].code).toBe('getMnemonic()');
    expect(f['EB.CUS.SHORT.NAME'].disabled).toBe('multi-value (MV)');
    expect(f['EB.CUS.LEGACY.ONLY'].disabled).toBe('no single-value getter');
  });

  it('unknown app gives an empty list', () => {
    expect(fieldsFor(knowledge, 'NOPE', 'java')).toEqual([]);
  });
});
