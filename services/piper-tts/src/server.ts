import express, { Request, Response } from 'express';
import { PiperWrapper } from './piper-wrapper';
import { createLogger } from '@radio/core';
import { promises as fs } from 'fs';

const logger = createLogger('piper-server');

export interface SynthesizeRequest {
  text: string;
  model?: string;
  speed?: number;
}

export interface SynthesizeResponse {
  audio: string; // hex-encoded WAV
  duration_sec: number;
  model: string;
}

/**
 * HTTP server for Piper TTS
 */
export class PiperServer {
  private app: express.Application;
  private piper: PiperWrapper;

  constructor() {
    this.app = express();
    this.piper = new PiperWrapper();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes() {
    /**
     * POST /synthesize
     * Generate speech from text
     */
    this.app.post('/synthesize', async (req: Request, res: Response) => {
      try {
        const { text, model, speed }: SynthesizeRequest = req.body;

        // Validate
        if (!text || text.length === 0) {
          return res.status(400).json({
            error: 'Text is required'
          });
        }

        if (text.length > 10000) {
          return res.status(400).json({
            error: 'Text too long (max 10000 characters)'
          });
        }

        // Synthesize
        const result = await this.piper.synthesize({
          text,
          model: model || 'en_US-lessac-medium',
          speed: speed || 1.0
        });

        // Read audio file
        const audioData = await fs.readFile(result.audioPath);

        // Clean up temp file
        await fs.unlink(result.audioPath);

        // Return hex-encoded audio
        const response: SynthesizeResponse = {
          audio: audioData.toString('hex'),
          duration_sec: result.durationSec,
          model: result.model
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
        service: 'piper-tts'
      });
    });
  }

  /**
   * Start server
   */
  start(port: number = 5002) {
    this.app.listen(port, () => {
      logger.info({ port }, 'Piper TTS server started');
    });
  }
}
