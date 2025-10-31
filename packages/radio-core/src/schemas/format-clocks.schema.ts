import { z } from 'zod';

/**
 * Format clock slot schema - single slot within an hour
 */
export const formatClockSlotSchema = z.object({
  mm_ss: z.string().regex(/^[0-5][0-9]:[0-5][0-9]$/).describe('Time offset MM:SS'),
  slot_type: z.string().min(1).describe('Slot type (news, culture, etc)'),
  min_sec: z.number().int().positive().describe('Minimum duration seconds'),
  max_sec: z.number().int().positive().describe('Maximum duration seconds'),
  recipe: z.record(z.unknown()).nullable().optional().describe('Additional slot config')
});

export type FormatClockSlot = z.infer<typeof formatClockSlotSchema>;

/**
 * Format clock schema - hourly program structure
 */
export const formatClockSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique clock identifier'),
  name: z.string().min(1).describe('Clock name'),
  
  // Structure
  hour_template: z.array(formatClockSlotSchema).min(1).describe('Hourly slot structure'),
  
  // Details
  description: z.string().nullable().optional().describe('Clock description'),
  active: z.boolean().default(true).describe('Is clock active'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type FormatClock = z.infer<typeof formatClockSchema>;