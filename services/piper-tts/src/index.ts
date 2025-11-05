import { PiperServer } from './server';
import { createLogger } from '@radio/core';

const logger = createLogger('piper-main');

async function main() {
  const port = parseInt(process.env.PORT || '5002');

  const server = new PiperServer();
  await server.start(port);

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    process.exit(0);
  });
}

main().catch(error => {
  logger.error({ error }, 'Server crashed');
  process.exit(1);
});
