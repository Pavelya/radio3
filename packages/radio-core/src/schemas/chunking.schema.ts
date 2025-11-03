import { z } from 'zod';

/**
 * Chunker configuration schema
 */
export const chunkConfigSchema = z.object({
  minTokens: z.number().int().positive().describe('Minimum tokens per chunk'),
  maxTokens: z.number().int().positive().describe('Maximum tokens per chunk'),
  overlapTokens: z.number().int().nonnegative().describe('Token overlap between chunks')
});

export type ChunkConfig = z.infer<typeof chunkConfigSchema>;

/**
 * Text chunk schema
 */
export const chunkSchema = z.object({
  chunkText: z.string().describe('Chunk text content'),
  chunkIndex: z.number().int().nonnegative().describe('Chunk index in document'),
  tokenCount: z.number().int().positive().describe('Token count for chunk'),
  contentHash: z.string().length(64).describe('SHA-256 hash of content')
});

export type Chunk = z.infer<typeof chunkSchema>;
