// Several fields for one field input. The bundled templates (and their golden cases, compiled on
// a real R25 install) are written for exactly one field, so a single selection always renders the
// template untouched. When more fields are ticked, the edits below swap the field-specific
// statements of that template for a repeated block:
//
//   {{#FIELD}} … {{/FIELD}}                  repeated once per selected field
//   {{#FIELD join=" || "}} … {{/FIELD}}      … with a separator between the copies
//
// Inside a block {{FIELD}} and {{FIELD_NAME}} are that copy's field; everything else is filled as
// usual. Inputs not listed here (a field holding a record id, a hot field driven by one value, the
// deprecated per-field validateField, …) stay single-choice. multiField.test.js checks that every
// `find` still occurs exactly once in its template, so a template change cannot silently skip one.

import { render, resolve } from './render';

const JAVA_VALIDATE = (record) => ({
  find: `        String value = ${record}.get{{FIELD}}().getValue();
        if (value == null || value.isEmpty()) {
            ${record}.get{{FIELD}}().setError("{{ERROR_TEXT}}");
        }
`,
  replace: `{{#FIELD}}        String value{{FIELD}} = ${record}.get{{FIELD}}().getValue();
        if (value{{FIELD}} == null || value{{FIELD}}.isEmpty()) {
            ${record}.get{{FIELD}}().setError("{{ERROR_TEXT}}");
        }
{{/FIELD}}`,
});

const OFS_FIELDS = (newValue) => ({
  find: `,{{FIELD_NAME}}:1:1=':${newValue}`,
  replace: `{{#FIELD join=":'"}},{{FIELD_NAME}}:1:1=':${newValue}{{/FIELD}}`,
});

const TARGET_SET = (value) => ({
  input: 'TARGET_FIELD',
  find: `        target.set{{TARGET_FIELD}}("${value}");\n`,
  replace: `{{#TARGET_FIELD}}        target.set{{TARGET_FIELD}}("${value}");\n{{/TARGET_FIELD}}`,
});

export const MULTI_FIELD = {
  'infobasic/vvr': [
    {
      find: `    IF AF NE {{FIELD}} THEN RETURN\n`,
      replace: `    Y.CHECKED = 0
{{#FIELD}}    IF AF EQ {{FIELD}} THEN Y.CHECKED = 1
{{/FIELD}}    IF NOT(Y.CHECKED) THEN RETURN
`,
    },
  ],
  'infobasic/vir': [
    {
      find: `    Y.VALUE = R.NEW({{FIELD}})
    IF Y.VALUE EQ '' THEN
        AF = {{FIELD}}
        ETEXT = '{{ERROR_TEXT}}'
        CALL STORE.END.ERROR
    END
`,
      replace: `{{#FIELD}}    Y.VALUE = R.NEW({{FIELD}})
    IF Y.VALUE EQ '' THEN
        AF = {{FIELD}}
        ETEXT = '{{ERROR_TEXT}}'
        CALL STORE.END.ERROR
    END
{{/FIELD}}`,
    },
  ],
  'infobasic/var': [
    {
      input: 'LINK_FIELD',
      find: `    IF Y.READ.ERR NE '' OR R.LINK<{{LINK_FIELD}}> EQ '' THEN\n`,
      replace: `    IF Y.READ.ERR NE ''{{#LINK_FIELD}} OR R.LINK<{{LINK_FIELD}}> EQ ''{{/LINK_FIELD}} THEN\n`,
    },
  ],
  'infobasic/nofile': [
    {
      find: `    Y.SEL.VALUE = ''
    LOCATE '{{FIELD_NAME}}' IN D.FIELDS<1> SETTING Y.POS THEN
        Y.SEL.VALUE = D.RANGE.AND.VALUE<Y.POS>
    END
`,
      replace: `    Y.SEL.WITH = ''
{{#FIELD}}    LOCATE '{{FIELD_NAME}}' IN D.FIELDS<1> SETTING Y.POS THEN
        IF Y.SEL.WITH NE '' THEN Y.SEL.WITH = Y.SEL.WITH:' AND '
        Y.SEL.WITH = Y.SEL.WITH:'{{FIELD_NAME}} EQ ':DQUOTE(D.RANGE.AND.VALUE<Y.POS>)
    END
{{/FIELD}}    IF Y.SEL.WITH EQ '' THEN RETURN
`,
    },
    {
      find: `    SEL.CMD = 'SELECT ':FN.APP:' WITH {{FIELD_NAME}} EQ ':DQUOTE(Y.SEL.VALUE)\n`,
      replace: `    SEL.CMD = 'SELECT ':FN.APP:' WITH ':Y.SEL.WITH\n`,
    },
  ],
  'infobasic/ofs-routine': [OFS_FIELDS('Y.NEW.VALUE')],
  'jbc/validation': [
    {
      find: `    lvValue = EB.SystemTables.getRNew({{FIELD}})
    IF lvValue EQ '' THEN
        EB.SystemTables.setE('{{ERROR_TEXT}}')
    END
`,
      replace: `{{#FIELD}}    lvValue = EB.SystemTables.getRNew({{FIELD}})
    IF lvValue EQ '' THEN
        EB.SystemTables.setE('{{ERROR_TEXT}}')
        RETURN
    END
{{/FIELD}}`,
    },
  ],
  'jbc/get-api': [
    {
      find: `        fieldValue = record<{{FIELD}}>\n`,
      replace: `        * One value per selected field, field-mark separated, in the order below.
{{#FIELD}}        fieldValue<-1> = record<{{FIELD}}>
{{/FIELD}}`,
    },
  ],
  'jbc/write-api': [OFS_FIELDS('newValue')],
  'jbc/nofile': [
    {
      find: `    selValue = ''
    LOCATE '{{FIELD_NAME}}' IN EB.Reports.getDFields()<1> SETTING fieldPos THEN
        selValue = EB.Reports.getDRangeAndValue()<fieldPos>
    END
    selCmd = 'SELECT F.{{APP}} WITH {{FIELD_NAME}} EQ ':DQUOTE(selValue)
`,
      replace: `    selWith = ''
    dFields = EB.Reports.getDFields()
    dValues = EB.Reports.getDRangeAndValue()
{{#FIELD}}    LOCATE '{{FIELD_NAME}}' IN dFields<1> SETTING fieldPos THEN
        IF selWith NE '' THEN selWith = selWith:' AND '
        selWith = selWith:'{{FIELD_NAME}} EQ ':DQUOTE(dValues<fieldPos>)
    END
{{/FIELD}}    IF selWith EQ '' THEN RETURN
    selCmd = 'SELECT F.{{APP}} WITH ':selWith
`,
    },
  ],
  'java/record-lifecycle-default': [
    {
      find: `        String value = rec.get{{FIELD}}().getValue();
        if (value == null || value.isEmpty()) {
            rec.set{{FIELD}}("{{DEFAULT_VALUE}}");
            currentRecord.set(rec.toStructure());
        }
`,
      replace: `        boolean changed = false;
{{#FIELD}}        String value{{FIELD}} = rec.get{{FIELD}}().getValue();
        if (value{{FIELD}} == null || value{{FIELD}}.isEmpty()) {
            rec.set{{FIELD}}("{{DEFAULT_VALUE}}");
            changed = true;
        }
{{/FIELD}}        if (changed) {
            currentRecord.set(rec.toStructure());
        }
`,
    },
  ],
  'java/record-lifecycle-hot-field': [
    {
      find: `        if (!"{{FIELD_NAME}}".equals(currentInputValue.getFieldName())) {\n`,
      replace: `        if (!java.util.Arrays.asList({{#FIELD join=", "}}"{{FIELD_NAME}}"{{/FIELD}})
                .contains(currentInputValue.getFieldName())) {\n`,
    },
    {
      input: 'TARGET_FIELD',
      find: `        rec.set{{TARGET_FIELD}}("{{DEFAULT_VALUE}}");\n`,
      replace: `{{#TARGET_FIELD}}        rec.set{{TARGET_FIELD}}("{{DEFAULT_VALUE}}");\n{{/TARGET_FIELD}}`,
    },
  ],
  'java/record-lifecycle-validate': [JAVA_VALIDATE('rec')],
  'java/record-lifecycle-update': [TARGET_SET('{{TARGET_VALUE}}')],
  'java/record-lifecycle-post-update': [TARGET_SET('{{TARGET_VALUE}}')],
  'java/enquiry-nofile': [
    {
      find: `        String selectValue = "";
        for (FilterCriteria criteria : filterCriteria) {
            if ("{{FIELD_NAME}}".equals(criteria.getFieldname())) {
                selectValue = criteria.getValue();
            }
        }
        if (selectValue == null || selectValue.isEmpty()) {
            return new ArrayList<>();
        }
        DataAccess da = new DataAccess(this);
        return da.selectRecords("", "{{APP}}", "", "WITH {{FIELD_NAME}} EQ '" + selectValue + "'");
`,
      replace: `        List<String> selectionFields = java.util.Arrays.asList({{#FIELD join=", "}}"{{FIELD_NAME}}"{{/FIELD}});
        List<String> conditions = new ArrayList<>();
        for (FilterCriteria criteria : filterCriteria) {
            String value = criteria.getValue();
            if (selectionFields.contains(criteria.getFieldname()) && value != null && !value.isEmpty()) {
                conditions.add(criteria.getFieldname() + " EQ '" + value + "'");
            }
        }
        if (conditions.isEmpty()) {
            return new ArrayList<>();
        }
        DataAccess da = new DataAccess(this);
        return da.selectRecords("", "{{APP}}", "", "WITH " + String.join(" AND ", conditions));
`,
    },
  ],
  'java/activity-lifecycle-validate': [JAVA_VALIDATE('arrangementActivityRecord')],
  'java/payment-order-validate': [JAVA_VALIDATE('paymentOrderRecord')],
};

const editsFor = (templateId) =>
  (MULTI_FIELD[templateId] || []).map((edit) => ({ input: 'FIELD', ...edit }));

/** True when this field input of the template accepts several fields. */
export function isMultiField(templateId, inputId) {
  return editsFor(templateId).some((edit) => edit.input === inputId);
}

/** A field input's value as a list: [] when nothing is chosen. */
export function fieldList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [String(value)] : [];
}

const BLOCK = /{{#([A-Z_]+)(?: join="([^"]*)")?}}([\s\S]*?){{\/\1}}/g;

function expandBlocks(text, items) {
  return text.replace(BLOCK, (match, id, join = '', body) => {
    if (!items[id]) return match;
    return items[id]
      .map((item) => body.replace(new RegExp(`{{(${id}|${id}_NAME)}}`, 'g'), (_, key) => item[key]))
      .join(join);
  });
}

/**
 * resolve + render for inputs whose field values may be lists. One field per input renders the
 * bundled template unchanged; more apply that template's multi-field edits.
 */
export function generateFiles(template, inputs, knowledge, today) {
  const first = { ...inputs };
  const multi = [];
  for (const spec of template.inputs) {
    if (spec.kind !== 'field' || !(spec.id in inputs)) continue;
    const list = fieldList(inputs[spec.id]);
    first[spec.id] = list[0] ?? '';
    if (list.length > 1) {
      if (!isMultiField(template.id, spec.id))
        throw new Error(`${spec.label} takes one field; ${list.length} are selected`);
      multi.push([spec.id, list]);
    }
  }
  const values = resolve(template, first, knowledge, today);
  if (!multi.length) return render(template, values);

  const items = {};
  for (const [id, list] of multi)
    items[id] = list.map((field) => {
      const v = resolve(template, { ...first, [id]: field }, knowledge, today);
      return { [id]: v[id], [`${id}_NAME`]: v[`${id}_NAME`] };
    });
  const files = { ...template.files };
  for (const edit of editsFor(template.id)) {
    if (!items[edit.input]) continue;
    for (const name of Object.keys(files))
      if (files[name].includes(edit.find))
        files[name] = files[name].replace(edit.find, () => expandBlocks(edit.replace, items));
  }
  return render({ ...template, files }, values);
}
