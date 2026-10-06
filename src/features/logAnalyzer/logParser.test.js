// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  entryAsText,
  formatXml,
  matchesFilter,
  parseLog,
  parseLogLine,
  parseOfsXml,
} from './logParser';

const OFS_XML =
  '<ofsApplication><application>FUNDS.TRANSFER</application><version>FUNDS.TRANSFER,</version>' +
  '<ofsFunction>I</ofsFunction><transactionId>FT26244ABCDE</transactionId>' +
  '<companyId>GB0010001</companyId><message><field><fieldName>DEBIT.ACCOUNT</fieldName>' +
  '<value>12345</value><multiValueNumber>1</multiValueNumber></field>' +
  '<field><fieldName></fieldName><value>x</value></field></message></ofsApplication>';

const OFS_LINE =
  '[INFO ]20260901 10:15:30.1234 42 [S1] [INPUTTER] [OFS.MODULE] OFS request ' + OFS_XML;

describe('parseLogLine', () => {
  it('reads the header and pulls out the OFS application message', () => {
    const e = parseLogLine(OFS_LINE, 7);
    expect(e).toMatchObject({
      line: 7,
      parsed: true,
      level: 'INFO',
      timestamp: '2026-09-01 10:15:30.1234',
      thread: '42',
      session: 'S1',
      user: 'INPUTTER',
      module: 'OFS.MODULE',
      message: 'OFS request',
      error: false,
    });
    expect(e.ofs.data).toMatchObject({
      application: 'FUNDS.TRANSFER',
      version: 'FUNDS.TRANSFER,',
      transactionId: 'FT26244ABCDE',
      fields: [{ fieldName: 'DEBIT.ACCOUNT', value: '12345', multiValueNumber: '1' }],
    });
  });

  it('extracts OFS warnings and other XML, and flags #ERROR# messages', () => {
    const e = parseLogLine(
      '[WARN]20260901 10:15:30.1234 1 [S] [U] [M] #ERROR# failed ' +
        '<ofs><warnings><warningtext>Override A</warningtext><warningtext>B</warningtext></warnings></ofs>' +
        ' <response code="1"><x>y</x></response> tail',
    );
    expect(e.level).toBe('WARN');
    expect(e.error).toBe(true);
    expect(e.warnings).toEqual(['Override A', 'B']);
    expect(e.xml).toEqual(['<response code="1"><x>y</x></response>']);
    expect(e.message).toBe('#ERROR# failed tail');
  });

  it('keeps lines it cannot parse', () => {
    const e = parseLogLine('   at com.temenos.Foo(Foo.java:12)', 3);
    expect(e).toMatchObject({ parsed: false, level: '', message: e.raw, line: 3 });
  });

  it('does not hang on a long run of attributes', () => {
    const started = Date.now();
    parseLogLine('[INFO ]20260901 10:15:30.1234 1 [S] [U] [M] <a' + ' b'.repeat(5000));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('parseLog', () => {
  it('skips blank lines and numbers entries by their line in the file', () => {
    const entries = parseLog('first\r\n\r\n' + OFS_LINE + '\n');
    expect(entries.map((e) => e.line)).toEqual([1, 3]);
  });
});

describe('parseOfsXml', () => {
  it('returns null for broken XML', () => {
    expect(parseOfsXml('<ofsApplication><application>')).toBeNull();
  });
});

describe('matchesFilter', () => {
  const [plain, ofs] = parseLog('[ERROR]20260901 10:15:30.1234 1 [S] [U] [M] boom\n' + OFS_LINE);
  it('filters by text across the line and its XML', () => {
    expect(matchesFilter(ofs, 'debit.account', '')).toBe(true);
    expect(matchesFilter(plain, 'debit.account', '')).toBe(false);
  });
  it('filters by level and by OFS content', () => {
    expect(matchesFilter(plain, '', 'ERROR')).toBe(true);
    expect(matchesFilter(ofs, '', 'ERROR')).toBe(false);
    expect(matchesFilter(ofs, '', 'OFS')).toBe(true);
    expect(matchesFilter(plain, '', 'OFS')).toBe(false);
  });
});

describe('formatting', () => {
  it('indents XML', () => {
    expect(formatXml('<a><b>1</b><c><d>2</d></c></a>')).toBe(
      '<a>\n  <b>1</b>\n  <c>\n    <d>2</d>\n  </c>\n</a>',
    );
  });

  it('writes an entry as plain text', () => {
    const text = entryAsText(parseLogLine(OFS_LINE, 2), 'app.log');
    expect(text).toContain('Source: app.log');
    expect(text).toContain('Line: 2');
    expect(text).toContain('application: FUNDS.TRANSFER');
    expect(text).toContain('DEBIT.ACCOUNT:1 = 12345');
    expect(text).toContain('Raw line:\n' + OFS_LINE);
  });
});
