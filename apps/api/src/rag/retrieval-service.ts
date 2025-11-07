import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger, type RAGQuery, type RAGResult, type RAGChunk } from '@radio/core';

const logger = createLogger('retrieval-service');

/**
 * Hybrid retrieval service
 * Combines lexical search + recency boosting
 * (Simplified version using only lexical search for testing)
 */
export class RetrievalService {
  private db: SupabaseClient;
  private readonly timeout: number = 2000; // 2 seconds

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Retrieve relevant chunks for query
   */
  async retrieve(query: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now();

    try {
      // Lexical search (simplified for testing)
      const lexicalResults = await this.lexicalSearch(
        query.text,
        query.topK || 12,
        query.filters
      );

      // Merge and rank
      const mergedResults = this.mergeResults(
        new Map(), // No vector results for now
        lexicalResults,
        query.recency_boost || false,
        query.reference_time
      );

      const queryTime = Date.now() - startTime;

      logger.info({
        queryLength: query.text.length,
        resultsCount: mergedResults.length,
        queryTime
      }, 'Retrieval complete');

      return {
        chunks: mergedResults.slice(0, query.topK || 12),
        query_time_ms: queryTime,
        total_results: mergedResults.length
      };

    } catch (error) {
      const queryTime = Date.now() - startTime;
      logger.error({ error, queryTime }, 'Retrieval failed');
      throw error;
    }
  }

  /**
   * Lexical search (BM25 approximation using ts_rank)
   */
  private async lexicalSearch(
    queryText: string,
    limit: number,
    filters?: RAGQuery['filters']
  ): Promise<Map<string, { chunk: any; score: number }>> {
    // Extract keywords
    const keywords = queryText
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10) // Use top 10 keywords
      .join(' & ');

    if (!keywords) {
      return new Map();
    }

    let query = this.db
      .from('kb_chunks')
      .select(`
        id,
        source_id,
        source_type,
        chunk_text,
        lang
      `)
      .textSearch('chunk_text', keywords)
      .limit(limit * 2);

    // Apply filters
    if (filters?.source_types) {
      query = query.in('source_type', filters.source_types);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error }, 'Lexical search failed');
      throw error;
    }

    const results = new Map<string, { chunk: any; score: number }>();

    for (const row of data || []) {
      // Calculate simple keyword match score
      const matchCount = keywords
        .split(' & ')
        .filter(kw => row.chunk_text.toLowerCase().includes(kw))
        .length;

      const score = matchCount / keywords.split(' & ').length;

      results.set(row.id, {
        chunk: row,
        score
      });
    }

    return results;
  }

  /**
   * Merge and rank results
   */
  private mergeResults(
    vectorResults: Map<string, { chunk: any; score: number }>,
    lexicalResults: Map<string, { chunk: any; score: number }>,
    applyRecencyBoost: boolean,
    referenceTime?: string
  ): RAGChunk[] {
    const merged = new Map<string, RAGChunk>();

    // Combine scores
    for (const [chunkId, { chunk, score }] of vectorResults.entries()) {
      merged.set(chunkId, {
        chunk_id: chunkId,
        source_id: chunk.source_id,
        source_type: chunk.source_type,
        chunk_text: chunk.chunk_text,
        vector_score: score,
        lexical_score: 0,
        recency_score: 0,
        final_score: score
      });
    }

    for (const [chunkId, { chunk, score }] of lexicalResults.entries()) {
      if (merged.has(chunkId)) {
        const existing = merged.get(chunkId)!;
        existing.lexical_score = score;
      } else {
        merged.set(chunkId, {
          chunk_id: chunkId,
          source_id: chunk.source_id,
          source_type: chunk.source_type,
          chunk_text: chunk.chunk_text,
          vector_score: 0,
          lexical_score: score,
          recency_score: 0,
          final_score: score
        });
      }
    }

    // Calculate final scores
    const results: RAGChunk[] = [];

    for (const result of merged.values()) {
      // Weighted combination
      result.final_score = (
        result.vector_score * 0.7 +
        result.lexical_score * 0.3
      );

      // Apply recency boost for events
      if (applyRecencyBoost && result.source_type === 'event') {
        // TODO: Fetch event date and calculate recency score
        result.recency_score = 0.2; // Placeholder
        result.final_score *= (1 + result.recency_score);
      }

      results.push(result);
    }

    // Sort by final score
    results.sort((a, b) => b.final_score - a.final_score);

    return results;
  }
}
