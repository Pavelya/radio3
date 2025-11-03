import { createLogger, type EmbedderJobPayload } from '@radio/core';

const logger = createLogger('embedder-job-handler');

/**
 * Handler for kb_index jobs
 * Will be implemented in R5
 */
export class EmbedderJobHandler {
  async handle(job: any): Promise<void> {
    const payload: EmbedderJobPayload = job.payload;

    logger.info({
      sourceId: payload.source_id,
      sourceType: payload.source_type
    }, 'Processing embedding job');

    // TODO: Implement in R5
    // 1. Fetch source document
    // 2. Chunk text
    // 3. Generate embeddings
    // 4. Store in database

    throw new Error('Not implemented yet - see R5');
  }
}
