import { describe, expect, it } from 'vitest';
import {
  configFromState,
  fieldPreview,
  generateData,
  generateMessage,
  handoffFromOfs,
  initialOfsState,
  optionSegment,
  parseData,
  parseMessage,
  splitMessage,
  stateFromConfig,
  stateFromHandoff,
  userSegment,
  versionName,
} from './ofsMessage';

const state = (patch) => ({ ...initialOfsState(), ...patch });

describe('OFS segments', () => {
  it('keeps inner blank options and drops trailing ones', () => {
    expect(optionSegment({ version: 'FT.STD', fn: 'I', processing: 'PROCESS' })).toBe(
      'FT.STD/I/PROCESS',
    );
    expect(optionSegment({ version: '', fn: '', processing: 'VALIDATE' })).toBe('//VALIDATE');
    expect(optionSegment({ version: '', fn: '', processing: '', gts: '', auth: '' })).toBe('');
    expect(optionSegment({ fn: 'I', processing: 'PROCESS', gts: '', auth: '2' })).toBe(
      '/I/PROCESS//2',
    );
  });

  it('builds the user segment only when something is set', () => {
    expect(userSegment({ user: '', password: '', company: '' })).toBe('');
    expect(userSegment({ user: 'INPUTT', password: 'pw', company: '' })).toBe('INPUTT/pw');
    expect(userSegment({ user: 'INPUTT', password: 'pw', company: 'GB0010001' })).toBe(
      'INPUTT/pw/GB0010001',
    );
  });
});

describe('OFS message data', () => {
  const fields = [
    { name: 'APPLICATION', values: [{ mv: '1', sv: '', value: 'SECTOR' }] },
    {
      name: 'DESCRIPT',
      values: [
        { mv: '1', sv: '2', value: 'Industrie, Ltd' },
        { mv: '', sv: '', value: '' },
      ],
    },
    { name: '  ', values: [{ mv: '', sv: '', value: 'ignored' }] },
  ];

  it('generates FIELD:MV:SV=VALUE, escapes commas and skips empty values and names', () => {
    expect(generateData(fields)).toBe('APPLICATION:1=SECTOR,DESCRIPT:1:2=Industrie? Ltd');
  });

  it('parses data back into fields grouped by name', () => {
    expect(parseData('APPLICATION:1:=SECTOR,DESCRIPT:1:2=Industrie? Ltd,DESCRIPT:2=Two')).toEqual([
      { name: 'APPLICATION', values: [{ mv: '1', sv: '', value: 'SECTOR' }] },
      {
        name: 'DESCRIPT',
        values: [
          { mv: '1', sv: '2', value: 'Industrie, Ltd' },
          { mv: '2', sv: '', value: 'Two' },
        ],
      },
    ]);
  });

  it('previews one field as it will appear in the message', () => {
    expect(fieldPreview(fields[1])).toBe('DESCRIPT:1:2=Industrie? Ltd, DESCRIPT=');
  });
});

describe('generateMessage', () => {
  it('needs an application for a transaction', () => {
    expect(generateMessage(state({}))).toEqual({
      error: 'Enter an application to build the message.',
    });
  });

  it('builds a transaction with all five parts', () => {
    const s = state({
      application: 'FUNDS.TRANSFER',
      version: 'TEST',
      user: 'INPUTT',
      password: 'secret',
      transactionId: 'FT1',
      fields: [{ name: 'DEBIT.ACCOUNT', values: [{ mv: '', sv: '', value: '123' }] }],
    });
    expect(generateMessage(s).message).toBe(
      'FUNDS.TRANSFER,TEST/I/PROCESS,INPUTT/secret,FT1,DEBIT.ACCOUNT=123',
    );
  });

  it('builds enquiry, XML report, clearing and TEC requests', () => {
    expect(generateMessage(state({ type: 'Enquiry', genericData: 'X' })).message).toBe(
      'ENQUIRY.SELECT,,,,X',
    );
    expect(
      generateMessage(state({ type: 'XMLReport', xmlOption: 'XML', genericId: 'R1' })).message,
    ).toBe('XML.REPORT,XML,,R1,');
    expect(generateMessage(state({ type: 'Clearing', genericId: 'C1' })).message).toBe(
      'CLEARING,,,C1,',
    );
    expect(generateMessage(state({ type: 'TEC', genericData: 'FLUSH' })).message).toBe(
      'TEC,,,,FLUSH',
    );
  });
});

describe('parseMessage', () => {
  it('splits on the first four commas only', () => {
    expect(splitMessage('A,B,C,D,E=1,F=2')).toEqual(['A', 'B', 'C', 'D', 'E=1,F=2']);
    expect(splitMessage('A')).toEqual(['A', '', '', '', '']);
  });

  it('round-trips a transaction', () => {
    const raw =
      'HELPTEXT.MENU,OFS.DEMO/I/PROCESS,TEST.USER/654321/GB0010001,OFS.TEST,APPLICATION:1:=SECTOR,DESCRIPT:1:2=Industrie';
    const { type, patch } = parseMessage(raw);
    expect(type).toBe('Transaction');
    expect(patch).toMatchObject({
      application: 'HELPTEXT.MENU',
      version: 'OFS.DEMO',
      fn: 'I',
      processing: 'PROCESS',
      user: 'TEST.USER',
      password: '654321',
      company: 'GB0010001',
      transactionId: 'OFS.TEST',
    });
    expect(generateMessage(state(patch)).message).toBe(
      'HELPTEXT.MENU,OFS.DEMO/I/PROCESS,TEST.USER/654321/GB0010001,OFS.TEST,APPLICATION:1=SECTOR,DESCRIPT:1:2=Industrie',
    );
  });

  it('recognises other request types', () => {
    expect(parseMessage('ENQUIRY.SELECT,,U/P,,CRITERIA').patch).toMatchObject({
      type: 'Enquiry',
      enquiryName: 'ENQUIRY.SELECT',
      genericData: 'CRITERIA',
    });
    expect(parseMessage('XML.REPORT,XML,,R1,').patch).toMatchObject({
      type: 'XMLReport',
      xmlOption: 'XML',
      genericId: 'R1',
    });
    expect(parseMessage('TEC,,,,FLUSH').type).toBe('TEC');
  });
});

describe('saved configuration', () => {
  it('never stores the password', () => {
    const config = configFromState(state({ application: 'FT', password: 'secret' }));
    expect(config.application).toBe('FT');
    expect(JSON.stringify(config)).not.toContain('secret');
    expect(config).not.toHaveProperty('password');
  });

  it('loads a configuration saved by the HTML tool, keeping the current password', () => {
    const next = stateFromConfig(
      {
        type: 'Transaction',
        application: 'CUSTOMER',
        fn: '',
        password: 'old',
        fields: [{ name: 'SHORT.NAME', values: [{ mv: 1, value: 'X' }] }],
      },
      state({ password: 'typed' }),
    );
    expect(next).toMatchObject({ application: 'CUSTOMER', fn: 'I', password: 'typed' });
    expect(next.fields).toEqual([
      { name: 'SHORT.NAME', values: [{ mv: '1', sv: '', value: 'X' }] },
    ]);
    expect(stateFromConfig(null)).toBeNull();
  });
});

describe('Log Analyzer handoff', () => {
  it('drops the application prefix from a logged version', () => {
    expect(versionName('FUNDS.TRANSFER', 'FUNDS.TRANSFER,')).toBe('');
    expect(versionName('FUNDS.TRANSFER', 'FUNDS.TRANSFER,ACTR')).toBe('ACTR');
    expect(versionName('FUNDS.TRANSFER', 'ACTR')).toBe('ACTR');
  });

  it('fills a transaction, groups values and leaves authentication blank', () => {
    const context = handoffFromOfs({
      application: 'FUNDS.TRANSFER',
      version: 'FUNDS.TRANSFER,ACTR',
      transactionId: 'FT1',
      companyId: 'GB0010001',
      fields: [
        { fieldName: 'NARRATIVE', value: 'a', multiValueNumber: '1' },
        { fieldName: 'NARRATIVE', value: 'b', multiValueNumber: '2' },
        { fieldName: '', value: 'skipped' },
      ],
    });
    const next = stateFromHandoff(context, state({ type: 'Enquiry' }));
    expect(next).toMatchObject({
      type: 'Transaction',
      application: 'FUNDS.TRANSFER',
      version: 'ACTR',
      fn: 'I',
      transactionId: 'FT1',
      company: 'GB0010001',
      user: '',
      password: '',
    });
    expect(generateData(next.fields)).toBe('NARRATIVE:1=a,NARRATIVE:2=b');
    expect(stateFromHandoff({})).toBeNull();
  });
});
