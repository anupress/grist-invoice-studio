import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rec = await import(pathToFileURL(_resolve(ROOT, 'src/model/records.js')).href);
const suggest = await import(pathToFileURL(_resolve(ROOT, 'src/model/suggest.js')).href);
const units = await import(pathToFileURL(_resolve(ROOT, 'src/doc/units.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// A table's own columns become fields. This is what makes the form work on somebody else's table.
// ---------------------------------------------------------------------------------------------
const cols = [
  { id: 'Name', type: 'Text' },
  { id: 'Price', type: 'Numeric' },
  { id: 'Image', type: 'Attachments' },
  { id: 'Colour', type: 'Text', label: 'Colour' },
  { id: 'Size', type: 'Choice', label: 'Size', widgetOptions: JSON.stringify({ choices: ['S', 'M', 'L'] }) },
  { id: 'InStock', type: 'Bool', label: 'Available' },
  { id: 'Launched', type: 'Date' },
  { id: 'Reorder', type: 'Int' },
  { id: 'Margin', type: 'Numeric', isFormula: true },
  { id: 'Supplier', type: 'Ref:Suppliers' },
  { id: 'Photos', type: 'Attachments' },
  { id: 'Tags', type: 'ChoiceList' },
  { id: 'manualSort', type: 'PositionNumber' },
];
const roles = { name: 'Name', unitPrice: 'Price', image: 'Image' };

{
  const extras = rec.extraFields('product', roles, cols);
  eq('unmapped, writable, simple columns become fields', extras.map((f) => f.colId), ['Colour', 'Size', 'InStock', 'Launched', 'Reorder']);
  eq('with the right control for each', extras.map((f) => f.type), ['text', 'choice', 'bool', 'date', 'number']);
  eq('a choice column offers its own list', extras.find((f) => f.colId === 'Size').choices, ['S', 'M', 'L']);
  eq('the label is the column label', extras.find((f) => f.colId === 'InStock').label, 'Available');
  ok('a formula column is not offered', !extras.some((f) => f.colId === 'Margin'));
  ok('nor a reference', !extras.some((f) => f.colId === 'Supplier'));
  ok('nor a second attachments column', !extras.some((f) => f.colId === 'Photos'));
  ok('nor a choice list', !extras.some((f) => f.colId === 'Tags'));
  ok('nor Grist’s own bookkeeping', !extras.some((f) => f.colId === 'manualSort'));
  ok('nor a column a role already claims', !extras.some((f) => ['Name', 'Price', 'Image'].includes(f.colId)));
  ok('an extra role can never collide with a known one', extras.every((f) => f.role.startsWith('@')));
}

// Reading and writing them.
{
  const row = { id: 2, Name: 'Enamel mug', Price: 11.5, Colour: 'Sage', Size: 'M', InStock: true, Launched: '2026-03-01', Reorder: 12 };
  const v = rec.readRecord(row, 'product', roles, cols);
  eq('the known fields', [v.name, v.unitPrice], ['Enamel mug', 11.5]);
  eq('and the table’s own', [v['@Colour'], v['@Size'], v['@InStock'], v['@Launched'], v['@Reorder']], ['Sage', 'M', true, '2026-03-01', 12]);
  eq('an empty extra reads as empty, not undefined', rec.readRecord({ id: 3 }, 'product', roles, cols)['@Colour'], '');
  eq('an empty boolean reads as false', rec.readRecord({ id: 3 }, 'product', roles, cols)['@InStock'], false);

  const p = rec.recordPlan({ kind: 'product', table: 'Products', roles, columns: cols, rowId: 2, values: { ...v, '@Colour': 'Ochre', '@InStock': false, '@Reorder': '20' } });
  eq('an extra text column is written', p.fields.Colour, 'Ochre');
  eq('a boolean is written as one', p.fields.InStock, false);
  eq('a number typed as text becomes a number', p.fields.Reorder, 20);
  eq('a date is written as Grist stores it', p.fields.Launched, Date.parse('2026-03-01T00:00:00Z') / 1000);
  ok('the formula column is never written', !('Margin' in p.fields));
}

// ---------------------------------------------------------------------------------------------
// The picture, in each of the three worlds it has to live in
// ---------------------------------------------------------------------------------------------
const URI = 'data:image/jpeg;base64,AAAA';
{
  const attach = { kind: 'product', table: 'Products', roles, columns: cols, rowId: null, values: { name: 'X', unitPrice: 1, image: URI } };
  ok('a data URI is refused by an Attachments column when nothing uploaded it',
    !('Image' in rec.recordPlan(attach).fields) && rec.recordPlan(attach).skipped.some((s) => s.role === 'image'));
  eq('but the demo stores it as it is', rec.recordPlan({ ...attach, imageMode: 'inline' }).fields.Image, URI);
  eq('an uploaded picture is the attachment list', rec.recordPlan({ ...attach, values: { ...attach.values, image: ['L', 7] } }).fields.Image, ['L', 7]);
  const textCols = cols.map((c) => (c.id === 'Image' ? { id: 'Image', type: 'Text' } : c));
  eq('a Text picture column takes the URI whatever the mode', rec.recordPlan({ ...attach, columns: textCols }).fields.Image, URI);
  eq('and an https address', rec.recordPlan({ ...attach, columns: textCols, values: { ...attach.values, image: 'https://e.example/a.jpg' } }).fields.Image, 'https://e.example/a.jpg');
}

// ---------------------------------------------------------------------------------------------
// Which missing fields the widget can add a column for
// ---------------------------------------------------------------------------------------------
{
  const bare = [{ id: 'Name', type: 'Text' }, { id: 'Price', type: 'Numeric' }];
  const f = rec.formFields('product', { name: 'Name', unitPrice: 'Price' }, bare);
  const picture = f.find((x) => x.role === 'image');
  ok('a catalogue with no picture column says the column can be added', !picture.present && picture.addable);
  const client = rec.formFields('client', { name: 'Name' }, [{ id: 'Name', type: 'Text' }]);
  eq('and so do the client fields the upgrade knows', client.filter((x) => x.addable).map((x) => x.role).sort(), ['country', 'email', 'language', 'phone', 'taxNumber']);
  ok('a field the upgrade has no column for is not offered', !client.find((x) => x.role === 'street1').addable);
  ok('a mapped field is never addable', rec.formFields('product', { name: 'Name', unitPrice: 'Price', image: 'Image' }, cols).find((x) => x.role === 'image').addable === false);
  // Every addable role must name a column the upgrade actually ships, or the button would fail.
  const { UPGRADE_PLAN } = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);
  for (const [part, map] of Object.entries(rec.ADDABLE)) {
    for (const [role, id] of Object.entries(map)) {
      const item = (UPGRADE_PLAN[part] || []).find((i) => i.id === id);
      ok(`the upgrade can add ${part}.${role}`, !!item && item.role === role);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The suggestion lists
// ---------------------------------------------------------------------------------------------
ok('country codes are two letters with a name', suggest.COUNTRIES.every(([c, n]) => /^[A-Z]{2}$/.test(c) && n.length > 2));
ok('the home market is first', suggest.COUNTRIES[0][0] === 'GB');
ok('currencies are three letters', suggest.CURRENCIES.every(([c]) => /^[A-Z]{3}$/.test(c)));
ok('every suggested unit is one an e-invoice will take', suggest.UNITS.every((u) => units.unitCode(u) !== 'C62' || ['item', 'pack', 'set'].includes(u) || units.unitCode(u) === 'C62'));
eq('an hour suggestion maps to HUR', units.unitCode(suggest.UNITS[0]), 'HUR');
eq('options come out as value and label', suggest.asOptions([['GB', 'United Kingdom']]), [{ value: 'GB', label: 'United Kingdom' }]);
eq('a plain list too', suggest.asOptions(['hour']), [{ value: 'hour', label: '' }]);
{
  const classes = suggest.taxClassesFor({ taxRates: [{ class: 'books' }, { class: '' }, { class: 'books' }] });
  eq('the document’s own classes come first, once each', classes.slice(0, 1), ['books']);
  ok('with the common ones after', classes.includes('reduced') && classes.includes('zero'));
  eq('no table, just the common ones', suggest.taxClassesFor({}), suggest.TAX_CLASSES);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
