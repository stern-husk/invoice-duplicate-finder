import { DuplicateDetectionOptions, DuplicateGroup, InvoiceLineItem } from './types';

const DEFAULT_OPTIONS: DuplicateDetectionOptions = {
  windowDays: 30,
  requireDifferentInvoice: true,
};

/**
 * Lowercases, strips punctuation, and collapses whitespace so that
 * "Consulting - March" and "consulting march" match as the same charge.
 * This is deliberately conservative (no stemming, no synonyms) since a
 * false duplicate match is more costly here than a missed one.
 */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses an ISO 8601 date string into epoch milliseconds. Throws on
 * anything Date.parse can't make sense of, rather than silently treating
 * a bad date as epoch 0 and matching everything.
 */
export function parseIsoDate(dateStr: string): number {
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid invoice date: "${dateStr}"`);
  }
  return ms;
}

/**
 * Splits a set of same-key line items into clusters where each item is
 * within windowDays of its neighbor in the sorted run. Chaining (rather
 * than comparing every pair to a fixed anchor date) means a duplicate
 * that got re-billed three times a week apart still ends up in one
 * cluster, while two charges eight months apart don't.
 */
export function clusterByDateWindow(
  items: readonly InvoiceLineItem[],
  windowDays: number
): InvoiceLineItem[][] {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const sorted = [...items].sort((a, b) => parseIsoDate(a.invoiceDate) - parseIsoDate(b.invoiceDate));

  const clusters: InvoiceLineItem[][] = [];
  let current: InvoiceLineItem[] = [];

  for (const item of sorted) {
    const prev = current[current.length - 1];
    if (prev && parseIsoDate(item.invoiceDate) - parseIsoDate(prev.invoiceDate) > windowMs) {
      clusters.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) {
    clusters.push(current);
  }
  return clusters;
}

function matchKey(item: InvoiceLineItem): string {
  return `${normalizeDescription(item.description)}::${item.amount}`;
}

function groupByMatchKey(items: readonly InvoiceLineItem[]): Map<string, InvoiceLineItem[]> {
  const groups = new Map<string, InvoiceLineItem[]>();
  for (const item of items) {
    const key = matchKey(item);
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

function countDistinctInvoices(items: readonly InvoiceLineItem[]): number {
  return new Set(items.map((item) => item.invoiceId)).size;
}

/**
 * Finds line items that are likely the same charge billed more than
 * once: same normalized description, same amount, and close together in
 * time. Returns one group per cluster of two or more matching items.
 */
export function findDuplicateLineItems(
  items: readonly InvoiceLineItem[],
  options: Partial<DuplicateDetectionOptions> = {}
): DuplicateGroup[] {
  const opts: DuplicateDetectionOptions = { ...DEFAULT_OPTIONS, ...options };
  const groups: DuplicateGroup[] = [];

  for (const [key, sameKeyItems] of groupByMatchKey(items)) {
    for (const cluster of clusterByDateWindow(sameKeyItems, opts.windowDays)) {
      if (cluster.length < 2) {
        continue;
      }
      if (opts.requireDifferentInvoice && countDistinctInvoices(cluster) < 2) {
        continue;
      }
      groups.push({ key, items: cluster });
    }
  }

  return groups;
}
