import { BYTES_PER_KILOBYTE, DATE_TIME_LOCALE } from '@superdoc-collab/types';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'];
const COUNT_FORMAT = new Intl.NumberFormat(DATE_TIME_LOCALE);
const SIZE_FORMAT = new Intl.NumberFormat(DATE_TIME_LOCALE, { maximumFractionDigits: 1 });

export function formatCount(count: number): string {
  return COUNT_FORMAT.format(count);
}

export function formatByteCount(byteCount: number): string {
  const magnitude = Math.floor(Math.log(byteCount) / Math.log(BYTES_PER_KILOBYTE));
  const unitIndex = Math.min(Math.max(magnitude, 0), BYTE_UNITS.length - 1);
  return `${SIZE_FORMAT.format(byteCount / BYTES_PER_KILOBYTE ** unitIndex)} ${BYTE_UNITS[unitIndex]}`;
}
