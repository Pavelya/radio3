import { z } from 'zod';

/**
 * Segment state enum - tracks the lifecycle of a radio segment
 */
export const segmentStateEnum = z.enum([
  'queued',      // Initial state
  'retrieving',  // RAG context fetch
  'generating',  // LLM script generation
  'rendering',   // TTS synthesis
  'normalizing', // FFmpeg mastering
  'ready',       // Available for playout
  'airing',      // Currently on-air
  'aired',       // Completed broadcast
  'archived',    // Post-broadcast storage
  'failed'       // Terminal failure state
]);

export type SegmentState = z.infer<typeof segmentStateEnum>;

/**
 * Citation object - references source material used in segment
 */
export const citationSchema = z.object({
  doc_id: z.string().uuid().describe('UUID of source document'),
  chunk_id: z.string().uuid().describe('UUID of specific chunk'),
  title: z.string().describe('Title of source document')
});

export type Citation = z.infer<typeof citationSchema>;

/**
 * Segment schema - represents a single piece of radio content
 */
export const segmentSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique segment identifier'),
  program_id: z.string().uuid().describe('Parent program'),
  
  // Content
  slot_type: z.string().min(1).describe('Type of content (news, culture, etc)'),
  state: segmentStateEnum.describe('Current lifecycle state'),
  lang: z.string().length(2).default('en').describe('Language code (ISO 639-1)'),
  
  // Generated content
  script_md: z.string().nullable().optional().describe('Generated script in Markdown'),
  asset_id: z.string().uuid().nullable().optional().describe('Audio asset reference'),
  duration_sec: z.number().positive().nullable().optional().describe('Duration in seconds'),
  
  // Scheduling
  scheduled_start_ts: z.string().datetime().nullable().optional().describe('When segment should air'),
  aired_at: z.string().datetime().nullable().optional().describe('When segment actually aired'),
  
  // Retry logic
  retry_count: z.number().int().nonnegative().default(0).describe('Number of retry attempts'),
  max_retries: z.number().int().positive().default(3).describe('Maximum retry attempts'),
  last_error: z.string().nullable().optional().describe('Last error message'),
  
  // Citations
  citations: z.array(citationSchema).default([]).describe('Source material references'),
  
  // Caching
  cache_key: z.string().nullable().optional().describe('Key for segment reuse'),
  parent_segment_id: z.string().uuid().nullable().optional().describe('Parent for variations'),
  
  // Metadata
  generation_metrics: z.record(z.unknown()).nullable().optional().describe('Performance metrics'),
  idempotency_key: z.string().nullable().optional().describe('For duplicate prevention'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type Segment = z.infer<typeof segmentSchema>;