const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseInvoiceLineItemsFromCsv,
  parseInvoiceLineItemsFromJson,
} = require('../dist/loader');

const HEADER = 'invoiceId,lineId,description,quantity,unitAmount,amount,invoiceDate';

test('parseInvoiceLineItemsFromCsv parses a well-formed row', () => {
  const csv = `${HEADER}\nINV-1,INV-1-1,Consulting,1,25000,25000,2026-03-01\n`;
  const items = parseInvoiceLineItemsFromCsv(csv);
  assert.deepEqual(items, [
    {
      invoiceId: 'INV-1',
      lineId: 'INV-1-1',
      description: 'Consulting',
      quantity: 1,
      unitAmount: 25000,
      amount: 25000,
      invoiceDate: '2026-03-01',
    },
  ]);
});

test('parseInvoiceLineItemsFromCsv ignores column order and extra columns', () => {
  const csv =
    'vendor,amount,invoiceDate,description,unitAmount,quantity,invoiceId,lineId\n' +
    'Acme,25000,2026-03-01,Consulting,25000,1,INV-1,INV-1-1\n';
  const items = parseInvoiceLineItemsFromCsv(csv);
  assert.equal(items.length, 1);
  assert.equal(items[0].description, 'Consulting');
  assert.equal(items[0].amount, 25000);
});

test('parseInvoiceLineItemsFromCsv handles quoted fields with commas and escaped quotes', () => {
  const csv = `${HEADER}\nINV-1,INV-1-1,"Consulting, ""March retainer""",1,25000,25000,2026-03-01\n`;
  const items = parseInvoiceLineItemsFromCsv(csv);
  assert.equal(items[0].description, 'Consulting, "March retainer"');
});

test('parseInvoiceLineItemsFromCsv handles a newline inside a quoted field', () => {
  const csv = `${HEADER}\nINV-1,INV-1-1,"Consulting\nMarch",1,25000,25000,2026-03-01\n`;
  const items = parseInvoiceLineItemsFromCsv(csv);
  assert.equal(items[0].description, 'Consulting\nMarch');
});

test('parseInvoiceLineItemsFromCsv returns an empty array for a header-only file', () => {
  assert.deepEqual(parseInvoiceLineItemsFromCsv(`${HEADER}\n`), []);
});

test('parseInvoiceLineItemsFromCsv returns an empty array for empty input', () => {
  assert.deepEqual(parseInvoiceLineItemsFromCsv(''), []);
});

test('parseInvoiceLineItemsFromCsv throws with a row number for a missing field', () => {
  const csv = 'invoiceId,lineId,description,quantity,unitAmount,amount\nINV-1,INV-1-1,Consulting,1,25000,25000\n';
  assert.throws(
    () => parseInvoiceLineItemsFromCsv(csv),
    /row 2: missing required field "invoiceDate"/
  );
});

test('parseInvoiceLineItemsFromCsv throws with a row number for a non-numeric amount', () => {
  const csv = `${HEADER}\nINV-1,INV-1-1,Consulting,1,25000,not-a-number,2026-03-01\n`;
  assert.throws(() => parseInvoiceLineItemsFromCsv(csv), /row 2: "amount" is not a number/);
});

test('parseInvoiceLineItemsFromCsv throws when a row has the wrong number of fields', () => {
  const csv = `${HEADER}\nINV-1,INV-1-1,Consulting,1,25000,2026-03-01\n`;
  assert.throws(() => parseInvoiceLineItemsFromCsv(csv), /row 2: expected 7 fields, got 6/);
});

test('parseInvoiceLineItemsFromJson accepts a top-level array', () => {
  const json = JSON.stringify([
    {
      invoiceId: 'INV-1',
      lineId: 'INV-1-1',
      description: 'Consulting',
      quantity: 1,
      unitAmount: 25000,
      amount: 25000,
      invoiceDate: '2026-03-01',
    },
  ]);
  const items = parseInvoiceLineItemsFromJson(json);
  assert.equal(items.length, 1);
  assert.equal(items[0].invoiceId, 'INV-1');
});

test('parseInvoiceLineItemsFromJson accepts an object with an items array', () => {
  const json = JSON.stringify({
    items: [
      {
        invoiceId: 'INV-1',
        lineId: 'INV-1-1',
        description: 'Consulting',
        quantity: 1,
        unitAmount: 25000,
        amount: 25000,
        invoiceDate: '2026-03-01',
      },
    ],
  });
  const items = parseInvoiceLineItemsFromJson(json);
  assert.equal(items.length, 1);
});

test('parseInvoiceLineItemsFromJson throws on invalid JSON', () => {
  assert.throws(() => parseInvoiceLineItemsFromJson('{not json'), /invalid JSON/);
});

test('parseInvoiceLineItemsFromJson throws when the JSON is neither an array nor an items envelope', () => {
  assert.throws(
    () => parseInvoiceLineItemsFromJson('{"foo": "bar"}'),
    /expected a JSON array of line items/
  );
});

test('parseInvoiceLineItemsFromJson throws with an item index for a missing field', () => {
  const json = JSON.stringify([{ invoiceId: 'INV-1', lineId: 'INV-1-1' }]);
  assert.throws(() => parseInvoiceLineItemsFromJson(json), /item 0: missing required field/);
});

test('parseInvoiceLineItemsFromJson throws when a numeric field is a string', () => {
  const json = JSON.stringify({
    invoiceId: 'INV-1',
    lineId: 'INV-1-1',
    description: 'Consulting',
    quantity: 1,
    unitAmount: 25000,
    amount: '25000',
    invoiceDate: '2026-03-01',
  });
  assert.throws(
    () => parseInvoiceLineItemsFromJson(`[${json}]`),
    /item 0: "amount" must be a number/
  );
});
