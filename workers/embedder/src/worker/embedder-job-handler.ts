import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Chunker } from '../chunking/chunker';
import { EmbeddingService } from '../embedding/embedding-service';
import { createLogger, type EmbedderJobPayload } from '@radio/core';

const logger = createLogger('embedder-job-handler');

/**
 * Handler for kb_index jobs
 * Processes document: fetch → chunk → embed → store
 */
export class EmbedderJobHandler {
  private db: SupabaseClient;
  private chunker: Chunker;
  private embedder: EmbeddingService;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const embeddingApiKey = process.env.EMBEDDING_API_KEY;

    if (!supabaseUrl || !supabaseKey || !embeddingApiKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.chunker = new Chunker();
    this.embedder = new EmbeddingService(embeddingApiKey);
  }

  /**
   * Process kb_index job
   */
  async handle(job: any): Promise<void> {
    const payload: EmbedderJobPayload = job.payload;
    const { source_id, source_type } = payload;

    logger.info({ source_id, source_type }, 'Starting embedding job');

    try {
      // 1. Update status to processing
      await this.updateIndexStatus(source_id, source_type, 'processing');

      // 2. Fetch source document
      const document = await this.fetchDocument(source_id, source_type);

      if (!document) {
        throw new Error(`Document not found: ${source_id}`);
      }

      // 3. Chunk document
      const chunks = this.chunker.chunk(document.body, document.lang);

      logger.info({
        source_id,
        chunkCount: chunks.length
      }, 'Document chunked');

      // 4. Generate embeddings
      const embeddingRequests = chunks.map(chunk => ({
        text: chunk.chunkText,
        contentHash: chunk.contentHash
      }));

      const embeddings = await this.embedder.embedMany(embeddingRequests);

      logger.info({
        source_id,
        embeddingCount: embeddings.length
      }, 'Embeddings generated');

      // 5. Store chunks and embeddings
      await this.storeChunksAndEmbeddings(
        source_id,
        source_type,
        chunks,
        embeddings.map(e => e.embedding)
      );

      // 6. Update status to complete
      await this.updateIndexStatus(
        source_id,
        source_type,
        'complete',
        chunks.length,
        embeddings.length
      );

      logger.info({ source_id }, 'Embedding job complete');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({ source_id, error: errorMessage }, 'Embedding job failed');

      // Update status to failed
      await this.updateIndexStatus(
        source_id,
        source_type,
        'failed',
        0,
        0,
        errorMessage
      );

      throw error;
    }
  }

  /**
   * Fetch source document from database
   */
  private async fetchDocument(
    sourceId: string,
    sourceType: string
  ): Promise<{ body: string; lang: string } | null> {
    const table = sourceType === 'universe_doc' ? 'universe_docs' : 'events';

    const { data, error } = await this.db
      .from(table)
      .select('body, lang')
      .eq('id', sourceId)
      .single();

    if (error) {
      logger.error({ error, sourceId, table }, 'Failed to fetch document');
      throw error;
    }

    return data;
  }

  /**
   * Store chunks and embeddings in database
   */
  private async storeChunksAndEmbeddings(
    sourceId: string,
    sourceType: string,
    chunks: any[],
    embeddings: number[][]
  ): Promise<void> {
    // Insert chunks
    const chunkRows = chunks.map(chunk => ({
      source_id: sourceId,
      source_type: sourceType,
      chunk_text: chunk.chunkText,
      chunk_index: chunk.chunkIndex,
      token_count: chunk.tokenCount,
      lang: chunk.lang,
      content_hash: chunk.contentHash
    }));

    const { data: insertedChunks, error: chunkError } = await this.db
      .from('kb_chunks')
      .insert(chunkRows)
      .select('id');

    if (chunkError) {
      logger.error({ error: chunkError }, 'Failed to insert chunks');
      throw chunkError;
    }

    // Insert embeddings
    const embeddingRows = insertedChunks.map((chunk, i) => ({
      chunk_id: chunk.id,
      embedding: embeddings[i]
    }));

    const { error: embeddingError } = await this.db
      .from('kb_embeddings')
      .insert(embeddingRows);

    if (embeddingError) {
      logger.error({ error: embeddingError }, 'Failed to insert embeddings');
      throw embeddingError;
    }

    logger.info({
      sourceId,
      chunksStored: chunks.length,
      embeddingsStored: embeddings.length
    }, 'Stored in database');
  }

  /**
   * Update kb_index_status
   */
  private async updateIndexStatus(
    sourceId: string,
    sourceType: string,
    state: string,
    chunksCreated: number = 0,
    embeddingsCreated: number = 0,
    error?: string
  ): Promise<void> {
    const updates: any = {
      state,
      chunks_created: chunksCreated,
      embeddings_created: embeddingsCreated,
      updated_at: new Date().toISOString()
    };

    if (state === 'processing') {
      updates.started_at = new Date().toISOString();
    }

    if (state === 'complete') {
      updates.completed_at = new Date().toISOString();
    }

    if (error) {
      updates.error = error;
    }

    const { error: updateError } = await this.db
      .from('kb_index_status')
      .upsert({
        source_id: sourceId,
        source_type: sourceType,
        ...updates
      });

    if (updateError) {
      logger.error({ error: updateError }, 'Failed to update index status');
      throw updateError;
    }
  }
}
