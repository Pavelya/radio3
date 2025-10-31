import { z } from 'zod';

/**
 * RAG query schema - input for retrieval
 */
export const ragQuerySchema = z.object({
  // Query
  text: z.string().min(1).describe('Search query text'),
  
  // Filters
  filters: z.object({
    lang: z.string().nullable().optional().describe('Language filter'),
    topics: z.array(z.string()).nullable().optional().describe('Topic filters'),
    date_range: z.object({
      start: z.string().datetime().nullable().optional(),
      end: z.string().datetime().nullable().optional()
    }).nullable().optional().describe('Date range filter')
  }).nullable().optional(),
  
  // Parameters
  top_k: z.number().int().positive().default(12).describe('Number of results'),
  recency_boost: z.boolean().default(true).describe('Boost recent content'),
  reference_time: z.string().datetime().nullable().optional().describe('Reference time for recency')
});

export type RAGQuery = z.infer<typeof ragQuerySchema>;

/**
 * RAG result chunk schema
 */
export const ragResultChunkSchema = z.object({
  chunk_id: z.string().uuid().describe('Chunk identifier'),
  doc_id: z.string().uuid().describe('Source document identifier'),
  chunk_text: z.string().describe('Chunk text content'),
  doc_title: z.string().describe('Source document title'),
  vector_score: z.number().describe('Vector similarity score'),
  lexical_score: z.number().describe('Lexical match score'),
  final_score: z.number().describe('Combined relevance score'),
  metadata: z.record(z.unknown()).nullable().optional().describe('Additional metadata')
});

export type RAGResultChunk = z.infer<typeof ragResultChunkSchema>;

/**
 * RAG result schema - output from retrieval
 */
export const ragResultSchema = z.object({
  chunks: z.array(ragResultChunkSchema).describe('Retrieved chunks'),
  query_time_ms: z.number().describe('Query execution time'),
  total_results: z.number().describe('Total matching results')
});

export type RAGResult = z.infer<typeof ragResultSchema>;