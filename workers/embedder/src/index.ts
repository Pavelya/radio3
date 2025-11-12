import { BaseWorker } from './worker/base-worker';
import { EmbedderJobHandler } from './worker/embedder-job-handler';
import { createLogger } from '@radio/core';
import * as os from 'os';
import { config } from 'dotenv';

// Load environment variables
config();

const logger = createLogger('embedder-main');

/**
 * Embedder Worker
 * Processes kb_index jobs to chunk and embed documents
 */
class EmbedderWorker extends BaseWorker {
  private handler: EmbedderJobHandler;

  constructor() {
    super({
      workerType: 'kb_index',
      instanceId: `embedder-${os.hostname()}-${process.pid}`,
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
      heartbeatInterval: 30,
      leaseSeconds: 300
    });

    this.handler = new EmbedderJobHandler();
  }

  protected async handleJob(job: any): Promise<void> {
    await this.handler.handle(job);
  }
}

// Main entry point
async function main() {
  const worker = new EmbedderWorker();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received');
    await worker.stop();
    process.exit(0);
  });

  // Start worker
  await worker.start();
}

main().catch(error => {
  logger.error({ error }, 'Worker crashed');
  process.exit(1);
});

// Export for library usage
export { Chunker } from './chunking/chunker';
export { Tokenizer } from './chunking/tokenizer';
export { MarkdownCleaner } from './chunking/markdown-cleaner';
export { EmbeddingService } from './embedding/embedding-service';
export { EmbeddingClient } from './embedding/embedding-client';
