import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@radio/core';

const logger = createLogger('cache-manager');

export interface CacheEntry {
  audioPath: string;
  durationSec: number;
  model: string;
  cachedAt: number;
  sizeBytes: number;
}

/**
 * File-based cache for TTS audio
 */
export class CacheManager {
  private readonly cacheDir: string;
  private readonly maxCacheSizeBytes: number;
  private cacheIndex: Map<string, CacheEntry>;

  constructor() {
    this.cacheDir = process.env.PIPER_CACHE_DIR || '/var/cache/piper-tts';
    this.maxCacheSizeBytes = parseInt(process.env.MAX_CACHE_SIZE_MB || '10240') * 1024 * 1024; // 10GB default
    this.cacheIndex = new Map();

    logger.info({
      cacheDir: this.cacheDir,
      maxSizeMB: this.maxCacheSizeBytes / 1024 / 1024
    }, 'Cache manager initialized');
  }

  /**
   * Initialize cache (create directory, load index)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadIndex();
      logger.info({ entries: this.cacheIndex.size }, 'Cache initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize cache');
      throw error;
    }
  }

  /**
   * Generate cache key from synthesis parameters
   */
  getCacheKey(text: string, model: string, speed: number): string {
    const input = `${text}|${model}|${speed}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Check if cached audio exists
   */
  async get(cacheKey: string): Promise<CacheEntry | null> {
    const entry = this.cacheIndex.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Verify file still exists
    try {
      await fs.access(entry.audioPath);
      logger.debug({ cacheKey }, 'Cache hit');
      return entry;
    } catch {
      // File deleted, remove from index
      this.cacheIndex.delete(cacheKey);
      logger.warn({ cacheKey }, 'Cached file missing, removed from index');
      return null;
    }
  }

  /**
   * Store audio in cache
   */
  async set(
    cacheKey: string,
    audioPath: string,
    durationSec: number,
    model: string
  ): Promise<void> {
    try {
      // Get file size
      const stats = await fs.stat(audioPath);
      const sizeBytes = stats.size;

      // Check cache size, evict if needed
      await this.ensureCacheSpace(sizeBytes);

      // Copy to cache directory
      const cachedPath = path.join(this.cacheDir, `${cacheKey}.wav`);
      await fs.copyFile(audioPath, cachedPath);

      // Add to index
      const entry: CacheEntry = {
        audioPath: cachedPath,
        durationSec,
        model,
        cachedAt: Date.now(),
        sizeBytes
      };

      this.cacheIndex.set(cacheKey, entry);

      logger.info({
        cacheKey,
        sizeKB: Math.round(sizeBytes / 1024)
      }, 'Audio cached');

      // Persist index
      await this.saveIndex();

    } catch (error) {
      logger.error({ error, cacheKey }, 'Failed to cache audio');
    }
  }

  /**
   * Ensure cache has space, evict LRU entries if needed
   */
  private async ensureCacheSpace(requiredBytes: number): Promise<void> {
    const currentSize = this.getCurrentCacheSize();

    if (currentSize + requiredBytes <= this.maxCacheSizeBytes) {
      return;
    }

    logger.info({
      currentMB: Math.round(currentSize / 1024 / 1024),
      requiredMB: Math.round(requiredBytes / 1024 / 1024)
    }, 'Cache full, evicting entries');

    // Sort by cachedAt (oldest first)
    const entries = Array.from(this.cacheIndex.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

    let freedBytes = 0;

    for (const [key, entry] of entries) {
      try {
        // Delete file
        await fs.unlink(entry.audioPath);

        // Remove from index
        this.cacheIndex.delete(key);

        freedBytes += entry.sizeBytes;

        logger.debug({ key, sizeKB: Math.round(entry.sizeBytes / 1024) }, 'Cache entry evicted');

        // Check if we've freed enough space
        if (currentSize - freedBytes + requiredBytes <= this.maxCacheSizeBytes) {
          break;
        }
      } catch (error) {
        logger.error({ error, key }, 'Failed to evict cache entry');
      }
    }

    logger.info({ freedMB: Math.round(freedBytes / 1024 / 1024) }, 'Cache eviction complete');
  }

  /**
   * Get current total cache size
   */
  private getCurrentCacheSize(): number {
    let total = 0;
    for (const entry of this.cacheIndex.values()) {
      total += entry.sizeBytes;
    }
    return total;
  }

  /**
   * Load cache index from disk
   */
  private async loadIndex(): Promise<void> {
    const indexPath = path.join(this.cacheDir, 'index.json');

    try {
      const data = await fs.readFile(indexPath, 'utf-8');
      const entries = JSON.parse(data);

      this.cacheIndex = new Map(Object.entries(entries));

      logger.info({ entries: this.cacheIndex.size }, 'Cache index loaded');
    } catch (error) {
      // Index doesn't exist yet, start fresh
      logger.info('No existing cache index, starting fresh');
      this.cacheIndex = new Map();
    }
  }

  /**
   * Save cache index to disk
   */
  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.cacheDir, 'index.json');

    try {
      const entries = Object.fromEntries(this.cacheIndex);
      await fs.writeFile(indexPath, JSON.stringify(entries, null, 2));
    } catch (error) {
      logger.error({ error }, 'Failed to save cache index');
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalSize = this.getCurrentCacheSize();

    return {
      entries: this.cacheIndex.size,
      totalSizeMB: Math.round(totalSize / 1024 / 1024),
      maxSizeMB: Math.round(this.maxCacheSizeBytes / 1024 / 1024),
      utilizationPercent: (totalSize / this.maxCacheSizeBytes) * 100
    };
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    logger.warn('Clearing entire cache');

    for (const [key, entry] of this.cacheIndex.entries()) {
      try {
        await fs.unlink(entry.audioPath);
      } catch (error) {
        logger.error({ error, key }, 'Failed to delete cache file');
      }
    }

    this.cacheIndex.clear();
    await this.saveIndex();

    logger.info('Cache cleared');
  }
}
