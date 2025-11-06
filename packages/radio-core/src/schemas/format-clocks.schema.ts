import { z } from 'zod';

/**
 * Format clock slot schema - single slot within an hour
 * Stored in format_slots table
 */
export const formatSlotSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique slot identifier'),
  format_clock_id: z.string().uuid().describe('Parent format clock ID'),

  // Slot configuration
  slot_type: z.string().min(1).describe('Slot type (news, culture, music, interview, station_id, etc)'),
  duration_sec: z.number().int().positive().describe('Duration in seconds'),
  order_index: z.number().int().nonnegative().describe('Position within the hour (0-based)'),

  // Optional constraints
  required: z.boolean().default(true).describe('Can this slot be skipped?'),

  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type FormatSlot = z.infer<typeof formatSlotSchema>;

/**
 * Format clock schema - hourly program structure template
 * Stored in format_clocks table
 */
export const formatClockSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique clock identifier'),
  name: z.string().min(1).describe('Clock name'),

  // Details
  description: z.string().nullable().optional().describe('Clock description'),
  total_duration_sec: z.number().int().default(0).describe('Total duration of all slots (should be 3600)'),

  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type FormatClock = z.infer<typeof formatClockSchema>;

/**
 * Format clock with slots - used for API responses
 */
export const formatClockWithSlotsSchema = formatClockSchema.extend({
  slots: z.array(formatSlotSchema).optional().describe('Clock slots'),
  programs: z.array(z.object({ id: z.string().uuid(), name: z.string() })).optional().describe('Programs using this clock'),
  usage_count: z.number().optional().describe('Number of programs using this clock')
});

export type FormatClockWithSlots = z.infer<typeof formatClockWithSlotsSchema>;