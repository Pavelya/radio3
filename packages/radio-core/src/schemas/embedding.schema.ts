import { z } from 'zod';

/**
 * Embedding request schema - single text to embed
 */
export const embedRequestSchema = z.object({
  text: z.string().describe('Text to embed'),
  contentHash: z.string().length(64).describe('SHA-256 hash of content')
});

export type EmbedRequest = z.infer<typeof embedRequestSchema>;

/**
 * Embedding result schema - embedded text with cache info
 */
export const embedResultSchema = z.object({
  contentHash: z.string().length(64).describe('SHA-256 hash of content'),
  embedding: z.array(z.number()).length(1024).describe('1024-dim embedding vector'),
  cached: z.boolean().describe('Whether result came from cache')
});

export type EmbedResult = z.infer<typeof embedResultSchema>;

/**
 * Cached embedding schema - for cache storage
 */
export const cachedEmbeddingSchema = z.object({
  contentHash: z.string().length(64).describe('SHA-256 hash of content'),
  embedding: z.array(z.number()).length(1024).describe('1024-dim embedding vector')
});

export type CachedEmbedding = z.infer<typeof cachedEmbeddingSchema>;

/**
 * Embedding client request schema - batch request to API
 */
export const embeddingRequestSchema = z.object({
  texts: z.array(z.string()).describe('Texts to embed')
});

export type EmbeddingRequest = z.infer<typeof embeddingRequestSchema>;

/**
 * Embedding client response schema - batch response from API
 */
export const embeddingResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())).describe('Array of embedding vectors'),
  model: z.string().describe('Model used for embedding'),
  dimensions: z.number().int().positive().describe('Embedding dimensions')
});

export type EmbeddingResponse = z.infer<typeof embeddingResponseSchema>;
