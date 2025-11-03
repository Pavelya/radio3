import axios, { AxiosInstance } from 'axios';
import { createLogger, type EmbeddingRequest, type EmbeddingResponse } from '@radio/core';

const logger = createLogger('embedding-client');

/**
 * Client for text embedding API
 * Uses Hugging Face Inference API with bge-m3 model
 */
export class EmbeddingClient {
  private client: AxiosInstance;
  private readonly model = 'BAAI/bge-m3';
  private readonly batchSize = 32;
  private readonly timeout = 30000; // 30 seconds

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('EMBEDDING_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: 'https://api-inference.huggingface.co/pipeline/feature-extraction',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: this.timeout
    });
  }

  /**
   * Generate embeddings for texts
   * Automatically batches requests
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    logger.info({ count: texts.length }, 'Generating embeddings');

    // Process in batches
    const batches = this.createBatches(texts, this.batchSize);
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.debug({ batchIndex: i, batchSize: batch.length }, 'Processing batch');

      try {
        const embeddings = await this.embedBatch(batch);
        allEmbeddings.push(...embeddings);
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          batchIndex: i
        }, 'Batch embedding failed');
        throw error;
      }

      // Rate limiting: wait between batches
      if (i < batches.length - 1) {
        await this.sleep(500); // 500ms between batches
      }
    }

    logger.info({ count: allEmbeddings.length }, 'Embeddings generated');
    return allEmbeddings;
  }

  /**
   * Generate embeddings for a single batch
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.post(`/${this.model}`, {
        inputs: texts,
        options: {
          wait_for_model: true
        }
      });

      // HF returns different formats depending on input
      const embeddings = Array.isArray(response.data[0])
        ? response.data
        : [response.data];

      // Validate dimensions
      for (const embedding of embeddings) {
        if (embedding.length !== 1024) {
          throw new Error(`Expected 1024 dimensions, got ${embedding.length}`);
        }
      }

      return embeddings;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error({
          status: error.response?.status,
          data: error.response?.data
        }, 'Embedding API error');

        // Handle rate limiting
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded');
        }

        // Handle model loading
        if (error.response?.status === 503) {
          throw new Error('Model is loading, retry later');
        }
      }

      throw error;
    }
  }

  /**
   * Split texts into batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for ms milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
