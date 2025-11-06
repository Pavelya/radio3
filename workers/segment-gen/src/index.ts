import { BaseWorker } from '../../embedder/src/worker/base-worker';
import { SegmentGenHandler } from './worker/segment-gen-handler';
import { createLogger } from '@radio/core';
import * as os from 'os';

const logger = createLogger('segment-gen-main');

/**
 * Segment Generation Worker
 * Processes segment_make jobs to generate scripts
 */
class SegmentGenWorker extends BaseWorker {
  private handler: SegmentGenHandler;

  constructor() {
    super({
      workerType: 'segment_make',
      instanceId: `segment-gen-${os.hostname()}-${process.pid}`,
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '2'),
      heartbeatInterval: 30,
      leaseSeconds: 300
    });

    this.handler = new SegmentGenHandler();
  }

  protected async handleJob(job: any): Promise<void> {
    await this.handler.handle(job);
  }
}

async function main() {
  const worker = new SegmentGenWorker();

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
