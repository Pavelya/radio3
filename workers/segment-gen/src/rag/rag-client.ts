import axios, { AxiosInstance } from 'axios';
import { createLogger, type RAGQuery, type RAGChunk, type RAGResult } from '@radio/core';

const logger = createLogger('rag-client');

/**
 * Client for RAG retrieval service
 */
export class RAGClient {
  private client: AxiosInstance;
  private readonly timeout: number = 2000; // 2 seconds

  constructor() {
    const apiUrl = process.env.API_URL || 'http://localhost:8000';

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: this.timeout
    });

    logger.info({ apiUrl, timeout: this.timeout }, 'RAG client initialized');
  }

  /**
   * Retrieve relevant chunks for query
   */
  async retrieve(query: RAGQuery): Promise<RAGResult> {
    logger.info({
      queryLength: query.text.length,
      topK: query.topK || 12
    }, 'Retrieving RAG context');

    const startTime = Date.now();

    try {
      const response = await this.client.post('/rag/retrieve', query);

      const duration = Date.now() - startTime;

      logger.info({
        chunks: response.data.chunks.length,
        duration
      }, 'RAG retrieval complete');

      return response.data;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          logger.error({ duration }, 'RAG retrieval timeout');
          throw new Error('RAG retrieval timeout');
        }

        logger.error({
          status: error.response?.status,
          error: error.message,
          duration
        }, 'RAG retrieval failed');
      }

      throw error;
    }
  }

  /**
   * Build query from segment requirements
   */
  buildQuery(segment: any, referenceTime: string): RAGQuery {
    // Build query based on slot type
    const queries: Record<string, string> = {
      'news': 'recent events and news developments',
      'culture': 'cultural trends and artistic movements',
      'tech': 'technological advancements and innovations',
      'history': 'historical context and past events',
      'interview': 'notable figures and their perspectives',
      'station_id': 'station information and programming'
    };

    const baseQuery = queries[segment.slot_type] || 'general information';

    return {
      text: baseQuery,
      topK: 12,
      recency_boost: segment.slot_type === 'news',
      reference_time: referenceTime
    };
  }
}
