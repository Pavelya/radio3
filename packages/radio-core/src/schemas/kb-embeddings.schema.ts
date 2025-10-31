import { z } from 'zod';

/**
 * KB embedding schema - vector embeddings
 */
export const kbEmbeddingSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique embedding identifier'),
  chunk_id: z.string().uuid().describe('Reference to chunk'),
  
  // Embedding
  embedding: z.array(z.number()).length(1024).describe('Vector embedding (1024 dimensions)'),
  model: z.string().min(1).default('bge-m3').describe('Model used for embedding'),
  
  // Metadata
  metadata: z.record(z.unknown()).nullable().optional().describe('Additional metadata'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp')
});

export type KBEmbedding = z.infer<typeof kbEmbeddingSchema>;