import { z } from 'zod';

/**
 * Program schema - show metadata
 */
export const programSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique program identifier'),
  name: z.string().min(1).describe('Program name'),
  
  // Configuration
  dj_id: z.string().uuid().describe('DJ reference'),
  format_clock_id: z.string().uuid().describe('Format clock reference'),
  lang: z.string().length(2).default('en').describe('Language code'),
  
  // Details
  description: z.string().nullable().optional().describe('Program description'),
  genre: z.string().nullable().optional().describe('Program genre'),
  duration_hours: z.number().positive().default(1).describe('Default duration in hours'),
  
  // Status
  active: z.boolean().default(true).describe('Is program active'),
  
  // Metadata
  metadata: z.record(z.unknown()).nullable().optional().describe('Additional config'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type Program = z.infer<typeof programSchema>;