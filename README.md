# invoice-duplicate-finder

Finds invoice line items that were probably billed twice.

## The problem

If invoice data gets pulled from more than one place (a vendor's monthly
export plus a corrected re-export, two different AP tools feeding the same
ledger, a person re-entering a line by hand) the same charge can end up in
your line-item table more than once. It's rarely an exact re-insert of the
same row; it's the same description and the same amount, a few days apart,
under a different invoice number. Grepping for exact duplicate rows misses
these. This tool answers one question: given a batch of line items, which
ones look like the same charge billed more than once?

## Usage

```ts
import { findDuplicateLineItems, InvoiceLineItem } from './src/index';

const lineItems: InvoiceLineItem[] = [
  {
    invoiceId: 'INV-1001',
    lineId: 'INV-1001-1',
    description: 'Consulting - March',
    quantity: 1,
    unitAmount: 250000,
    amount: 250000,
    invoiceDate: '2026-03-05',
  },
  {
    invoiceId: 'INV-1014',
    lineId: 'INV-1014-1',
    description: 'Consulting - March',
    quantity: 1,
    unitAmount: 250000,
    amount: 250000,
    invoiceDate: '2026-03-12',
  },
  {
    invoiceId: 'INV-1001',
    lineId: 'INV-1001-2',
    description: 'Office supplies',
    quantity: 3,
    unitAmount: 1500,
    amount: 4500,
    invoiceDate: '2026-03-05',
  },
];

const duplicates = findDuplicateLineItems(lineItems);

console.log(duplicates);
// [
//   {
//     key: 'consulting march::250000',
//     items: [
//       { invoiceId: 'INV-1001', lineId: 'INV-1001-1', ... },
//       { invoiceId: 'INV-1014', lineId: 'INV-1014-1', ... },
//     ],
//   },
// ]
```

The "Office supplies" line doesn't match anything else, so it never shows
up. The two "Consulting - March" lines are on different invoices, seven
days apart, for the same amount, so they're grouped together for a human
to check.

Amounts are integer cents (`250000` = $2,500.00), not floats, so summing
and comparing them never runs into rounding noise.

### Tuning the match

```ts
findDuplicateLineItems(lineItems, {
  windowDays: 7,               // default 30: how many days apart still counts as "close"
  requireDifferentInvoice: false, // default true: also flag repeats within one invoice
  amountToleranceCents: 50,    // default 0: also flag amounts within 50 cents of each other
});
```

## What counts as a match

Two line items match when, after normalizing (lowercase, punctuation
stripped, whitespace collapsed), their descriptions are identical, their
amounts are within `amountToleranceCents` of each other (0 by default,
meaning exact), and their invoice dates fall within `windowDays` of each
other in a chained run (so three re-billed charges a week apart each
still land in one group, even though the first and third are two weeks
apart). Amount matching chains the same way: a run of near-equal amounts
each within tolerance of its neighbor lands in one group, even if the
smallest and largest in that run are more than `amountToleranceCents`
apart. When a group's amounts aren't all identical, its `key` reports the
range (e.g. `consulting march::250000-250050`) instead of a single value.

## Loading real invoice exports

`findDuplicateLineItems` takes `InvoiceLineItem[]` directly, but exports
usually arrive as CSV or JSON. Two parsers turn raw text into that shape:

```ts
import { parseInvoiceLineItemsFromCsv, parseInvoiceLineItemsFromJson } from './src/index';

const csvText = readFileSync('export.csv', 'utf8');
const lineItems = parseInvoiceLineItemsFromCsv(csvText);

const jsonText = readFileSync('export.json', 'utf8');
const lineItems2 = parseInvoiceLineItemsFromJson(jsonText);
```

`parseInvoiceLineItemsFromCsv` expects a header row with column names
matching `InvoiceLineItem`'s fields (`invoiceId`, `lineId`, `description`,
`quantity`, `unitAmount`, `amount`, `invoiceDate`); column order and extra
columns don't matter, and quoted fields with embedded commas are handled.
`parseInvoiceLineItemsFromJson` accepts either a top-level array or an
object with an `items` array. Both throw with a row/item number on the
first invalid record instead of silently skipping bad data.

## API

- `findDuplicateLineItems(items, options?)` — the main entry point.
- `normalizeDescription(text)` — the normalization used for matching.
- `clusterByDateWindow(items, windowDays)` — groups items by date proximity.
- `parseIsoDate(dateStr)` — parses and validates an ISO date string.
- `parseInvoiceLineItemsFromCsv(csvText)` — parses a CSV export into line items.
- `parseInvoiceLineItemsFromJson(jsonText)` — parses a JSON export into line items.

Every function here is pure: no I/O, no mutation of its arguments, same
input always gives the same output. That's what makes them easy to unit
test and safe to call from a script, a CLI, or a web handler without
worrying about hidden state.

## Building

```
npm install
npm run build
```

## Testing

```
npm test
```

Tests live under `test/` as plain JavaScript and run against the compiled
`dist/` output with Node's built-in test runner (`node:test`), so there's
no test framework dependency to install.

## Status

Core matching logic and CSV/JSON parsing both work, including amount
tolerance for near-duplicate amounts, and are covered by a test suite for
clustering, normalization, and loader edge cases. No CLI yet, and
description matching is still exact (no fuzzy matching).
