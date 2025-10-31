import { z } from 'zod';

/**
 * Events schema - time-stamped happenings in the universe
 */
export const eventSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique event identifier'),
  
  // Content
  title: z.string().min(1).describe('Event title'),
  description: z.string().min(1).describe('Event description'),
  event_date: z.string().datetime().describe('When event occurred in-universe'),
  lang: z.string().length(2).default('en').describe('Language code'),
  
  // Location
  location: z.string().nullable().optional().describe('Event location'),
  
  // Classification
  category: z.string().nullable().optional().describe('Event category'),
  tags: z.array(z.string()).default([]).describe('Event tags'),
  
  // Importance (for recency weighting)
  importance: z.number().int().min(1).max(10).default(5).describe('Importance score 1-10'),
  
  // Relationships
  related_doc_ids: z.array(z.string().uuid()).default([]).describe('Related universe docs'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type Event = z.infer<typeof eventSchema>;