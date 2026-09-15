import { InvoiceLineItem } from './types';

const REQUIRED_FIELDS = [
  'invoiceId',
  'lineId',
  'description',
  'quantity',
  'unitAmount',
  'amount',
  'invoiceDate',
] as const;

/**
 * Splits one CSV line into fields, honoring double-quoted fields that may
 * contain commas, newlines, and escaped quotes (""). Hand-rolled instead of
 * a naive split(',') because real invoice exports routinely have commas
 * inside descriptions ("Consulting, March retainer").
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);

    if (inQuotes) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Splits raw CSV text into logical lines, treating a newline inside an
 * open quote as part of the current record rather than a new row.
 */
function splitCsvRecords(csvText: string): string[] {
  const records: string[] = [];
  let record = '';
  let inQuotes = false;

  const normalized = csvText.replace(/\r\n/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charAt(i);
    if (ch === '"') {
      inQuotes = !inQuotes;
    }
    if (ch === '\n' && !inQuotes) {
      records.push(record);
      record = '';
    } else {
      record += ch;
    }
  }
  if (record.length > 0) {
    records.push(record);
  }
  return records;
}

function parseRequiredNumber(raw: string, field: string, rowNumber: number): number {
  const value = Number(raw);
  if (raw.trim() === '' || Number.isNaN(value)) {
    throw new Error(`row ${rowNumber}: "${field}" is not a number: "${raw}"`);
  }
  return value;
}

function rowToLineItem(row: Record<string, string>, rowNumber: number): InvoiceLineItem {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) {
      throw new Error(`row ${rowNumber}: missing required field "${field}"`);
    }
  }
  return {
    invoiceId: row.invoiceId as string,
    lineId: row.lineId as string,
    description: row.description as string,
    quantity: parseRequiredNumber(row.quantity as string, 'quantity', rowNumber),
    unitAmount: parseRequiredNumber(row.unitAmount as string, 'unitAmount', rowNumber),
    amount: parseRequiredNumber(row.amount as string, 'amount', rowNumber),
    invoiceDate: row.invoiceDate as string,
  };
}

/**
 * Parses CSV text (with a header row) into line items. Column order
 * doesn't matter; column names must match InvoiceLineItem's fields
 * exactly. Extra columns are ignored, which lets a raw export be pointed
 * at this function without stripping vendor-specific columns first.
 */
export function parseInvoiceLineItemsFromCsv(csvText: string): InvoiceLineItem[] {
  const records = splitCsvRecords(csvText).filter((line) => line.trim() !== '');
  if (records.length === 0) {
    return [];
  }

  const header = splitCsvLine(records[0] as string).map((h) => h.trim());
  const items: InvoiceLineItem[] = [];

  for (let i = 1; i < records.length; i++) {
    const rowNumber = i + 1;
    const fields = splitCsvLine(records[i] as string);
    if (fields.length !== header.length) {
      throw new Error(
        `row ${rowNumber}: expected ${header.length} fields, got ${fields.length}`
      );
    }
    const row: Record<string, string> = {};
    header.forEach((name, index) => {
      row[name] = fields[index] as string;
    });
    items.push(rowToLineItem(row, rowNumber));
  }

  return items;
}

function assertLineItemShape(value: unknown, index: number): InvoiceLineItem {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`item ${index}: expected an object, got ${typeof value}`);
  }
  const record = value as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      throw new Error(`item ${index}: missing required field "${field}"`);
    }
  }

  const { invoiceId, lineId, description, quantity, unitAmount, amount, invoiceDate } = record;

  const stringFields = { invoiceId, lineId, description, invoiceDate };
  for (const [name, field] of Object.entries(stringFields)) {
    if (typeof field !== 'string') {
      throw new Error(`item ${index}: "${name}" must be a string`);
    }
  }

  const numberFields = { quantity, unitAmount, amount };
  for (const [name, field] of Object.entries(numberFields)) {
    if (typeof field !== 'number' || Number.isNaN(field)) {
      throw new Error(`item ${index}: "${name}" must be a number`);
    }
  }

  return {
    invoiceId: invoiceId as string,
    lineId: lineId as string,
    description: description as string,
    quantity: quantity as number,
    unitAmount: unitAmount as number,
    amount: amount as number,
    invoiceDate: invoiceDate as string,
  };
}

/**
 * Parses JSON text into line items. Accepts either a top-level array of
 * line-item objects, or an object with an "items" array (the shape a lot
 * of accounting API responses use), so callers don't need to unwrap the
 * envelope themselves before validating.
 */
export function parseInvoiceLineItemsFromJson(jsonText: string): InvoiceLineItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid JSON: ${message}`);
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>).items)
      ? (parsed as Record<string, unknown>).items as unknown[]
      : null;

  if (list === null) {
    throw new Error('expected a JSON array of line items, or an object with an "items" array');
  }

  return list.map((item, index) => assertLineItemShape(item, index));
}
