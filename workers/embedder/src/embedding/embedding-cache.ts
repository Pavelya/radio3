import { createLogger, type CachedEmbedding } from '@radio/core';

const logger = createLogger('embedding-cache');

/**
 * In-memory cache for embeddings
 * Prevents regenerating embeddings for duplicate content
 */
export class EmbeddingCache {
  private cache: Map<string, number[]>;
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get cached embedding by content hash
   */
  get(contentHash: string): number[] | null {
    const embedding = this.cache.get(contentHash);

    if (embedding) {
      logger.debug({ contentHash }, 'Cache hit');
      return embedding;
    }

    return null;
  }

  /**
   * Store embedding in cache
   */
  set(contentHash: string, embedding: number[]): void {
    // Implement LRU: if cache full, remove oldest
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        logger.debug({ removedHash: firstKey }, 'Cache eviction');
      }
    }

    this.cache.set(contentHash, embedding);
  }

  /**
   * Get multiple embeddings
   * Returns Map of found embeddings and array of missing hashes
   */
  getMany(contentHashes: string[]): {
    found: Map<string, number[]>;
    missing: string[];
  } {
    const found = new Map<string, number[]>();
    const missing: string[] = [];

    for (const hash of contentHashes) {
      const embedding = this.get(hash);
      if (embedding) {
        found.set(hash, embedding);
      } else {
        missing.push(hash);
      }
    }

    logger.info({
      total: contentHashes.length,
      hits: found.size,
      misses: missing.length
    }, 'Cache lookup');

    return { found, missing };
  }

  /**
   * Store multiple embeddings
   */
  setMany(embeddings: CachedEmbedding[]): void {
    for (const { contentHash, embedding } of embeddings) {
      this.set(contentHash, embedding);
    }

    logger.info({ count: embeddings.length }, 'Cached embeddings');
  }

  /**
   * Clear all cached embeddings
   */
  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: (this.cache.size / this.maxSize) * 100
    };
  }
}
