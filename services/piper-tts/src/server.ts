import express, { Request, Response } from 'express';
import { PiperWrapper } from './piper-wrapper';
import { CacheManager } from './cache-manager';
import { createLogger } from '@radio/core';
import { promises as fs } from 'fs';

const logger = createLogger('piper-server');

export interface SynthesizeRequest {
  text: string;
  model?: string;
  speed?: number;
  use_cache?: boolean;
}

export interface SynthesizeResponse {
  audio: string; // hex-encoded WAV
  duration_sec: number;
  model: string;
  cached: boolean;
}

/**
 * HTTP server for Piper TTS
 */
export class PiperServer {
  private app: express.Application;
  private piper: PiperWrapper;
  private cache: CacheManager;

  constructor() {
    this.app = express();
    this.piper = new PiperWrapper();
    this.cache = new CacheManager();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize server
   */
  async initialize(): Promise<void> {
    await this.cache.initialize();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes() {
    /**
     * POST /synthesize
     * Generate speech from text (with caching)
     */
    this.app.post('/synthesize', async (req: Request, res: Response) => {
      try {
        const { text, model, speed, use_cache }: SynthesizeRequest = req.body;

        if (!text || text.length === 0) {
          return res.status(400).json({ error: 'Text is required' });
        }

        if (text.length > 10000) {
          return res.status(400).json({ error: 'Text too long (max 10000 characters)' });
        }

        const modelName = model || 'en_US-lessac-medium';
        const speedValue = speed || 1.0;
        const useCache = use_cache !== false; // Default: true

        let audioPath: string;
        let durationSec: number;
        let cached = false;

        // Check cache
        if (useCache) {
          const cacheKey = this.cache.getCacheKey(text, modelName, speedValue);
          const cachedEntry = await this.cache.get(cacheKey);

          if (cachedEntry) {
            logger.info({ cacheKey }, 'Using cached audio');
            audioPath = cachedEntry.audioPath;
            durationSec = cachedEntry.durationSec;
            cached = true;
          } else {
            // Generate and cache
            const result = await this.piper.synthesize({
              text,
              model: modelName,
              speed: speedValue
            });

            audioPath = result.audioPath;
            durationSec = result.durationSec;

            // Store in cache
            await this.cache.set(cacheKey, audioPath, durationSec, modelName);
            cached = false;
          }
        } else {
          // Generate without caching
          const result = await this.piper.synthesize({
            text,
            model: modelName,
            speed: speedValue
          });

          audioPath = result.audioPath;
          durationSec = result.durationSec;
          cached = false;
        }

        // Read audio file
        const audioData = await fs.readFile(audioPath);

        // Clean up temp file (if not cached)
        if (!cached) {
          await fs.unlink(audioPath);
        }

        const response: SynthesizeResponse = {
          audio: audioData.toString('hex'),
          duration_sec: durationSec,
          model: modelName,
          cached
        };

        res.json(response);

      } catch (error) {
        logger.error({ error }, 'Synthesis failed');
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Synthesis failed'
        });
      }
    });

    /**
     * GET /cache/stats
     * Get cache statistics
     */
    this.app.get('/cache/stats', (req: Request, res: Response) => {
      const stats = this.cache.getStats();
      res.json(stats);
    });

    /**
     * DELETE /cache
     * Clear cache
     */
    this.app.delete('/cache', async (req: Request, res: Response) => {
      try {
        await this.cache.clear();
        res.json({ message: 'Cache cleared' });
      } catch (error) {
        logger.error({ error }, 'Failed to clear cache');
        res.status(500).json({ error: 'Failed to clear cache' });
      }
    });

    /**
     * GET /models
     * List available voice models
     */
    this.app.get('/models', async (req: Request, res: Response) => {
      try {
        const models = await this.piper.listModels();
        res.json({ models });
      } catch (error) {
        logger.error({ error }, 'Failed to list models');
        res.status(500).json({
          error: 'Failed to list models'
        });
      }
    });

    /**
     * GET /health
     * Health check
     */
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'piper-tts',
        cache: this.cache.getStats()
      });
    });
  }

  /**
   * Start server
   */
  async start(port: number = 5002) {
    await this.initialize();

    this.app.listen(port, () => {
      logger.info({ port }, 'Piper TTS server started');
    });
  }
}
