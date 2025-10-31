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