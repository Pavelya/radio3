import { EmbeddingClient } from './embedding-client';
import { EmbeddingCache } from './embedding-cache';
import { createLogger, type EmbedRequest, type EmbedResult } from '@radio/core';

const logger = createLogger('embedding-service');

/**
 * High-level embedding service with caching
 */
export class EmbeddingService {
  private client: EmbeddingClient;
  private cache: EmbeddingCache;

  constructor(apiKey: string) {
    this.client = new EmbeddingClient(apiKey);
    this.cache = new EmbeddingCache();
  }

  /**
   * Generate embeddings for multiple texts
   * Uses cache to avoid redundant API calls
   */
  async embedMany(requests: EmbedRequest[]): Promise<EmbedResult[]> {
    if (requests.length === 0) {
      return [];
    }

    logger.info({ count: requests.length }, 'Embedding requests');

    // Check cache
    const hashes = requests.map(r => r.contentHash);
    const { found, missing } = this.cache.getMany(hashes);

    const results: EmbedResult[] = [];

    // Add cached results
    for (const [hash, embedding] of found.entries()) {
      results.push({ contentHash: hash, embedding, cached: true });
    }

    // Generate embeddings for cache misses
    if (missing.length > 0) {
      const textsToEmbed = requests
        .filter(r => missing.includes(r.contentHash))
        .map(r => r.text);

      logger.info({ count: missing.length }, 'Generating new embeddings');

      const newEmbeddings = await this.client.embed(textsToEmbed);

      // Add to results and cache
      for (let i = 0; i < missing.length; i++) {
        const hash = missing[i];
        const embedding = newEmbeddings[i];

        results.push({ contentHash: hash, embedding, cached: false });
        this.cache.set(hash, embedding);
      }
    }

    // Sort results to match input order
    const sortedResults = requests.map(req => {
      const result = results.find(r => r.contentHash === req.contentHash);
      if (!result) {
        throw new Error(`Missing result for hash ${req.contentHash}`);
      }
      return result;
    });

    const cachedCount = sortedResults.filter(r => r.cached).length;
    logger.info({
      total: sortedResults.length,
      cached: cachedCount,
      generated: sortedResults.length - cachedCount
    }, 'Embeddings complete');

    return sortedResults;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}
