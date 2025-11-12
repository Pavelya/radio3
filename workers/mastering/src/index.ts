import { BaseWorker } from '../../embedder/src/worker/base-worker';
import { MasteringHandler } from './worker/mastering-handler';
import { createLogger } from '@radio/core';
import * as os from 'os';
import { config } from 'dotenv';

// Load environment variables
config();

const logger = createLogger('mastering-main');

/**
 * Audio Mastering Worker
 * Processes audio_finalize jobs to normalize and finalize audio
 */
class MasteringWorker extends BaseWorker {
  private handler: MasteringHandler;

  constructor() {
    super({
      workerType: 'audio_finalize',
      instanceId: `mastering-${os.hostname()}-${process.pid}`,
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '4'),
      heartbeatInterval: 30,
      leaseSeconds: 300
    });

    this.handler = new MasteringHandler();
  }

  protected async handleJob(job: any): Promise<void> {
    await this.handler.handle(job);
  }
}

async function main() {
  const worker = new MasteringWorker();

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

  await worker.start();
}

main().catch(error => {
  logger.error({ error }, 'Worker crashed');
  process.exit(1);
});
