import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddingCache } from '../src/embedding/embedding-cache';

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(100);
  });

  it('should store and retrieve embeddings', () => {
    const hash = 'abc123';
    const embedding = Array(1024).fill(0.5);

    cache.set(hash, embedding);
    const retrieved = cache.get(hash);

    expect(retrieved).toEqual(embedding);
  });

  it('should return null for missing embeddings', () => {
    const retrieved = cache.get('nonexistent');
    expect(retrieved).toBeNull();
  });

  it('should handle batch operations', () => {
    const embeddings = [
      { contentHash: 'hash1', embedding: Array(1024).fill(0.1) },
      { contentHash: 'hash2', embedding: Array(1024).fill(0.2) }
    ];

    cache.setMany(embeddings);

    const { found, missing } = cache.getMany(['hash1', 'hash2', 'hash3']);

    expect(found.size).toBe(2);
    expect(missing).toEqual(['hash3']);
  });

  it('should evict oldest when cache full', () => {
    const smallCache = new EmbeddingCache(2);

    smallCache.set('hash1', [1]);
    smallCache.set('hash2', [2]);
    smallCache.set('hash3', [3]); // Should evict hash1

    expect(smallCache.get('hash1')).toBeNull();
    expect(smallCache.get('hash2')).not.toBeNull();
    expect(smallCache.get('hash3')).not.toBeNull();
  });

  it('should provide stats', () => {
    cache.set('hash1', [1]);
    cache.set('hash2', [2]);

    const stats = cache.getStats();

    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(100);
    expect(stats.utilizationPercent).toBe(2);
  });
});
