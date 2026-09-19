/**
 * A single line item from an invoice.
 *
 * Amounts are integer cents, not floats. Invoice data usually comes from a
 * CSV export or an accounting API where "12.30" and "12.3" both show up for
 * the same value, and float arithmetic on money invites off-by-a-cent bugs
 * that only surface on the invoices nobody double-checks.
 */
export interface InvoiceLineItem {
  invoiceId: string;
  lineId: string;
  description: string;
  quantity: number;
  /** Price per unit, in integer cents. */
  unitAmount: number;
  /** Total for this line, in integer cents. Not assumed to equal quantity * unitAmount. */
  amount: number;
  /** ISO 8601 date, e.g. "2026-03-14". */
  invoiceDate: string;
}

export interface DuplicateDetectionOptions {
  /**
   * Two line items only count as duplicates if their invoice dates fall
   * within this many days of each other (chained through the sorted run,
   * so a slow drift across many invoices won't match, but a tight cluster
   * will).
   */
  windowDays: number;
  /**
   * When true (the default), line items on the same invoice are never
   * flagged against each other. Repeated identical lines within one
   * invoice are usually intentional (e.g. two identical hourly-rate
   * entries for two different days).
   */
  requireDifferentInvoice: boolean;
  /**
   * Two amounts count as matching if they're within this many cents of
   * each other. Defaults to 0 (exact match only). A small tolerance
   * catches re-billed charges that pick up a rounding adjustment or a
   * partial credit between the original and the duplicate.
   */
  amountToleranceCents: number;
}

export interface DuplicateGroup {
  /** Normalized description + amount that this group matched on. */
  key: string;
  items: InvoiceLineItem[];
}
