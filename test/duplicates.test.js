const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDescription,
  parseIsoDate,
  clusterByDateWindow,
  findDuplicateLineItems,
} = require('../dist/duplicates');

function item(overrides) {
  return {
    invoiceId: 'INV-1',
    lineId: 'INV-1-1',
    description: 'Consulting - March',
    quantity: 1,
    unitAmount: 100,
    amount: 100,
    invoiceDate: '2026-03-01',
    ...overrides,
  };
}

test('normalizeDescription lowercases, strips punctuation, collapses whitespace', () => {
  assert.equal(normalizeDescription('Consulting - March'), 'consulting march');
  assert.equal(normalizeDescription('  Widgets,  Inc.  '), 'widgets inc');
  assert.equal(normalizeDescription('Consulting - March'), normalizeDescription('consulting march'));
});

test('normalizeDescription keeps non-ASCII letters and digits', () => {
  assert.equal(normalizeDescription('Café #42!!'), 'café 42');
});

test('normalizeDescription treats an empty or punctuation-only string as empty', () => {
  assert.equal(normalizeDescription(''), '');
  assert.equal(normalizeDescription('...---...'), '');
});

test('parseIsoDate parses a valid ISO date', () => {
  assert.equal(parseIsoDate('2026-03-01'), Date.parse('2026-03-01'));
});

test('parseIsoDate throws on an unparseable date', () => {
  assert.throws(() => parseIsoDate('not-a-date'), /invalid invoice date/);
});

test('clusterByDateWindow returns one cluster for an empty list', () => {
  assert.deepEqual(clusterByDateWindow([], 30), []);
});

test('clusterByDateWindow puts a single item in its own cluster', () => {
  const a = item({ invoiceDate: '2026-03-01' });
  assert.deepEqual(clusterByDateWindow([a], 30), [[a]]);
});

test('clusterByDateWindow chains items exactly windowDays apart into one cluster', () => {
  const a = item({ lineId: 'a', invoiceDate: '2026-03-01' });
  const b = item({ lineId: 'b', invoiceDate: '2026-03-31' });
  assert.deepEqual(clusterByDateWindow([b, a], 30), [[a, b]]);
});

test('clusterByDateWindow splits items one day past windowDays into separate clusters', () => {
  const a = item({ lineId: 'a', invoiceDate: '2026-03-01' });
  const b = item({ lineId: 'b', invoiceDate: '2026-04-01' });
  assert.deepEqual(clusterByDateWindow([a, b], 30), [[a], [b]]);
});

test('clusterByDateWindow chains through intermediate items even if the ends are far apart', () => {
  const a = item({ lineId: 'a', invoiceDate: '2026-01-01' });
  const b = item({ lineId: 'b', invoiceDate: '2026-01-15' });
  const c = item({ lineId: 'c', invoiceDate: '2026-01-29' });
  assert.deepEqual(clusterByDateWindow([a, b, c], 14), [[a, b, c]]);
});

test('findDuplicateLineItems groups same description and amount on different invoices within the window', () => {
  const a = item({ invoiceId: 'INV-1001', lineId: 'INV-1001-1', invoiceDate: '2026-03-05' });
  const b = item({ invoiceId: 'INV-1014', lineId: 'INV-1014-1', invoiceDate: '2026-03-12' });
  const groups = findDuplicateLineItems([a, b]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'consulting march::100');
  assert.deepEqual(groups[0].items, [a, b]);
});

test('findDuplicateLineItems ignores items with different normalized descriptions', () => {
  const a = item({ description: 'Consulting - March' });
  const b = item({ description: 'Office supplies' });
  assert.deepEqual(findDuplicateLineItems([a, b]), []);
});

test('findDuplicateLineItems ignores items further apart than windowDays', () => {
  const a = item({ invoiceId: 'INV-1', invoiceDate: '2026-01-01' });
  const b = item({ invoiceId: 'INV-2', invoiceDate: '2026-06-01' });
  assert.deepEqual(findDuplicateLineItems([a, b]), []);
});

test('findDuplicateLineItems does not flag repeats on the same invoice by default', () => {
  const a = item({ invoiceId: 'INV-1', lineId: 'INV-1-1' });
  const b = item({ invoiceId: 'INV-1', lineId: 'INV-1-2' });
  assert.deepEqual(findDuplicateLineItems([a, b]), []);
});

test('findDuplicateLineItems flags repeats on the same invoice when requireDifferentInvoice is false', () => {
  const a = item({ invoiceId: 'INV-1', lineId: 'INV-1-1' });
  const b = item({ invoiceId: 'INV-1', lineId: 'INV-1-2' });
  const groups = findDuplicateLineItems([a, b], { requireDifferentInvoice: false });
  assert.equal(groups.length, 1);
});

test('findDuplicateLineItems respects amountToleranceCents and reports a range key', () => {
  const a = item({ invoiceId: 'INV-1', amount: 10000 });
  const b = item({ invoiceId: 'INV-2', amount: 10050 });
  assert.deepEqual(findDuplicateLineItems([a, b]), []);
  const groups = findDuplicateLineItems([a, b], { amountToleranceCents: 50 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'consulting march::10000-10050');
});

test('findDuplicateLineItems does not chain amounts past the tolerance from a single anchor', () => {
  const a = item({ invoiceId: 'INV-1', amount: 10000 });
  const b = item({ invoiceId: 'INV-2', amount: 10050 });
  const c = item({ invoiceId: 'INV-3', amount: 10100 });
  const groups = findDuplicateLineItems([a, b, c], { amountToleranceCents: 50 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
  assert.equal(groups[0].key, 'consulting march::10000-10100');
});

test('findDuplicateLineItems returns no groups for a single item', () => {
  assert.deepEqual(findDuplicateLineItems([item()]), []);
});

test('findDuplicateLineItems returns no groups for an empty batch', () => {
  assert.deepEqual(findDuplicateLineItems([]), []);
});
