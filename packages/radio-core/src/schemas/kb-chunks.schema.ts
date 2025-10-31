import { z } from 'zod';

/**
 * Chunk source type enum
 */
export const chunkSourceTypeEnum = z.enum([
  'universe_doc',
  'event'
]);

export type ChunkSourceType = z.infer<typeof chunkSourceTypeEnum>;

/**
 * KB chunk schema - chunked text for RAG
 */
export const kbChunkSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique chunk identifier'),
  
  // Source
  source_id: z.string().uuid().describe('Source document/event ID'),
  source_type: chunkSourceTypeEnum.describe('Type of source'),
  
  // Content
  chunk_text: z.string().min(1).describe('Chunked text content'),
  chunk_index: z.number().int().nonnegative().describe('Position in source'),
  lang: z.string().length(2).default('en').describe('Language code'),
  
  // Deduplication
  content_hash: z.string().nullable().optional().describe('SHA256 hash'),
  
  // Metrics
  token_count: z.number().int().positive().nullable().optional().describe('Token count'),
  
  // Metadata
  metadata: z.record(z.unknown()).nullable().optional().describe('Additional metadata'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp')
});

export type KBChunk = z.infer<typeof kbChunkSchema>;