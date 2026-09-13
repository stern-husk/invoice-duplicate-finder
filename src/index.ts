export type { InvoiceLineItem, DuplicateDetectionOptions, DuplicateGroup } from './types';
export {
  findDuplicateLineItems,
  normalizeDescription,
  parseIsoDate,
  clusterByDateWindow,
} from './duplicates';
