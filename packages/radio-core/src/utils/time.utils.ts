import { addYears, format } from 'date-fns';

/**
 * Add year offset to a date
 */
export function addYearOffset(date: Date, offset: number): Date {
  return addYears(date, offset);
}

/**
 * Convert real date to future broadcast time
 */
export function toFutureTime(realDate: Date, yearOffset: number): Date {
  return addYearOffset(realDate, yearOffset);
}

/**
 * Format date for broadcast display
 */
export function formatBroadcastTime(date: Date): string {
  return format(date, "EEEE, MMMM d, yyyy 'at' HH:mm");
}

/**
 * Get the future year offset from environment
 */
export function getFutureYearOffset(): number {
  return parseInt(process.env.FUTURE_YEAR_OFFSET || '500', 10);
}

/**
 * Get the current future year (current year + offset)
 */
export function getFutureYear(baseYear?: number): number {
  const year = baseYear || new Date().getFullYear();
  return year + getFutureYearOffset();
}