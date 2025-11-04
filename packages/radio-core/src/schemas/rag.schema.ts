import { z } from 'zod';

/**
 * RAG query schema - input for retrieval
 */
export const ragQuerySchema = z.object({
  // Query
  text: z.string().min(1).describe('Search query text'),
  lang: z.string().optional().describe('Language hint'),

  // Filters
  filters: z.object({
    source_types: z.array(z.enum(['universe_doc', 'event'])).optional().describe('Source type filters'),
    tags: z.array(z.string()).optional().describe('Tag filters')
  }).optional(),

  // Parameters
  topK: z.number().int().positive().default(12).describe('Number of results'),
  recency_boost: z.boolean().default(true).describe('Boost recent content'),
  reference_time: z.string().optional().describe('Reference time for recency (ISO datetime)')
});

export type RAGQuery = z.infer<typeof ragQuerySchema>;

/**
 * RAG result chunk schema
 */
export const ragChunkSchema = z.object({
  chunk_id: z.string().describe('Chunk identifier'),
  source_id: z.string().describe('Source document identifier'),
  source_type: z.enum(['universe_doc', 'event']).describe('Source type'),
  chunk_text: z.string().describe('Chunk text content'),
  vector_score: z.number().describe('Vector similarity score'),
  lexical_score: z.number().describe('Lexical match score'),
  recency_score: z.number().describe('Recency boost score'),
  final_score: z.number().describe('Combined relevance score')
});

export type RAGChunk = z.infer<typeof ragChunkSchema>;

/**
 * RAG result schema - output from retrieval
 */
export const ragResultSchema = z.object({
  chunks: z.array(ragChunkSchema).describe('Retrieved chunks'),
  query_time_ms: z.number().describe('Query execution time'),
  total_results: z.number().describe('Total matching results')
});

export type RAGResult = z.infer<typeof ragResultSchema>;