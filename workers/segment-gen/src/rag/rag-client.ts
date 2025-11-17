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
   * Build time-aware RAG query
   *
   * IMPORTANT: referenceTime should be the segment's scheduled_start_ts (future time),
   * NOT the real-world current time. This ensures RAG retrieves content appropriate
   * for the broadcast date in the fictional year 2525.
   *
   * Creates time-aware, context-specific queries
   */
  buildQuery(segment: any, referenceTime: string): RAGQuery {
    // Parse reference time for context
    // NOTE: This should be the BROADCAST time (e.g. 2525-01-16), not generation time
    const refDate = new Date(referenceTime);
    const year = refDate.getFullYear(); // Should be 2525 (or configured year), not 2025!
    const month = refDate.toLocaleDateString('en-US', { month: 'long' });
    const day = refDate.getDate();

    // Build time-aware queries based on slot type
    const queries: Record<string, string> = {
      'news': `What significant events, news developments, and current affairs are happening around ${month} ${day}, ${year}? What are the major stories and breaking news that listeners should know about today?`,

      'culture': `What cultural trends, artistic movements, entertainment, and creative works are prominent in ${month} ${year}? What are people talking about in arts, music, literature, and popular culture?`,

      'tech': `What technological advancements, innovations, and scientific breakthroughs are happening around ${month} ${year}? What new technologies are shaping society and daily life?`,

      'history': `What historical events and context are relevant around ${month} ${day}? What significant moments from the past are worth remembering today? What led us to where we are in ${year}?`,

      'interview': `Who are the notable figures, influential people, and interesting personalities active around ${month} ${year}? What are their views, achievements, and perspectives?`,

      'station_id': `What is the mission, programming, and identity of this radio station? What makes it unique and what does it offer to listeners in ${year}?`
    };

    const queryText = queries[segment.slot_type] ||
      `What general information, context, and interesting facts are relevant around ${month} ${day}, ${year}?`;

    logger.debug({
      slotType: segment.slot_type,
      referenceTime,
      year
    }, 'Built time-aware RAG query');

    return {
      text: queryText,
      topK: 12,
      recency_boost: segment.slot_type === 'news',
      reference_time: referenceTime
    };
  }
}
