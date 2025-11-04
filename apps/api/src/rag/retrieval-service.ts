import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EmbeddingService } from '../../../../workers/embedder/src/embedding/embedding-service';
import { createLogger, type RAGQuery, type RAGResult, type RAGChunk } from '@radio/core';

const logger = createLogger('retrieval-service');

/**
 * Hybrid retrieval service
 * Combines vector similarity + lexical search + recency boosting
 */
export class RetrievalService {
  private db: SupabaseClient;
  private embedder: EmbeddingService;
  private readonly timeout: number = 2000; // 2 seconds

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const embeddingApiKey = process.env.EMBEDDING_API_KEY;

    if (!supabaseUrl || !supabaseKey || !embeddingApiKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.embedder = new EmbeddingService(embeddingApiKey);
  }

  /**
   * Retrieve relevant chunks for query
   */
  async retrieve(query: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now();

    try {
      // Generate query embedding
      const queryEmbedding = await this.embedQuery(query.text);

      // Vector search
      const vectorResults = await this.vectorSearch(
        queryEmbedding,
        query.topK || 12,
        query.filters
      );

      // Lexical search (keywords)
      const lexicalResults = await this.lexicalSearch(
        query.text,
        query.topK || 12,
        query.filters
      );

      // Merge and rank
      const mergedResults = this.mergeResults(
        vectorResults,
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
   * Generate embedding for query
   */
  private async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedder.embedMany([{
      text,
      contentHash: `query-${Date.now()}`
    }]);

    return results[0].embedding;
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(
    embedding: number[],
    limit: number,
    filters?: RAGQuery['filters']
  ): Promise<Map<string, { chunk: any; score: number }>> {
    let query = this.db
      .rpc('match_chunks', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: limit * 2 // Get more for merging
      });

    // Apply filters
    if (filters?.source_types) {
      query = query.in('source_type', filters.source_types);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error }, 'Vector search failed');
      throw error;
    }

    const results = new Map<string, { chunk: any; score: number }>();

    for (const row of data || []) {
      results.set(row.chunk_id, {
        chunk: row,
        score: row.similarity
      });
    }

    return results;
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
