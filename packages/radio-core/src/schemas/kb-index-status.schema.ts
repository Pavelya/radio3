import { z } from 'zod';
import { chunkSourceTypeEnum } from './kb-chunks.schema';

/**
 * KB index state enum
 */
export const kbIndexStateEnum = z.enum([
  'pending',
  'processing',
  'complete',
  'failed'
]);

export type KBIndexState = z.infer<typeof kbIndexStateEnum>;

/**
 * KB index status schema - tracks embedding job status
 */
export const kbIndexStatusSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique status identifier'),
  
  // Source
  source_id: z.string().uuid().describe('Source document/event ID'),
  source_type: chunkSourceTypeEnum.describe('Type of source'),
  
  // State
  state: kbIndexStateEnum.default('pending').describe('Indexing state'),
  
  // Progress
  chunks_created: z.number().int().nonnegative().default(0).describe('Chunks created'),
  embeddings_created: z.number().int().nonnegative().default(0).describe('Embeddings created'),
  
  // Error tracking
  error: z.string().nullable().optional().describe('Error message'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type KBIndexStatus = z.infer<typeof kbIndexStatusSchema>;