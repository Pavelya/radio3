import axios, { AxiosInstance } from 'axios';
import { createLogger, type SynthesizeRequest, type SynthesizeResponse } from '@radio/core';
import { promises as fs } from 'fs';
import * as path from 'path';

const logger = createLogger('tts-client');

/**
 * Client for Piper TTS service
 */
export class TTSClient {
  private client: AxiosInstance;
  private readonly timeout: number = 60000; // 60 seconds

  constructor() {
    const ttsUrl = process.env.PIPER_TTS_URL || 'http://localhost:5002';

    this.client = axios.create({
      baseURL: ttsUrl,
      timeout: this.timeout,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    logger.info({ ttsUrl, timeout: this.timeout }, 'TTS client initialized');
  }

  /**
   * Synthesize speech from text
   */
  async synthesize(request: SynthesizeRequest): Promise<string> {
    logger.info({
      textLength: request.text.length,
      model: request.model || 'default',
      useCache: request.use_cache !== false
    }, 'Synthesizing speech');

    const startTime = Date.now();

    try {
      const response = await this.client.post<SynthesizeResponse>(
        '/synthesize',
        request
      );

      const duration = Date.now() - startTime;

      logger.info({
        duration,
        audioDuration: response.data.duration_sec,
        cached: response.data.cached
      }, 'Synthesis complete');

      // Decode hex audio to buffer
      const audioBuffer = Buffer.from(response.data.audio, 'hex');

      // Save to temp file
      const tempPath = path.join('/tmp', `tts-${Date.now()}.wav`);
      await fs.writeFile(tempPath, audioBuffer);

      logger.debug({ tempPath, sizeKB: Math.round(audioBuffer.length / 1024) }, 'Audio saved');

      return tempPath;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        logger.error({
          status: error.response?.status,
          error: error.message,
          duration
        }, 'TTS synthesis failed');
      }

      throw error;
    }
  }

  /**
   * Check TTS service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
