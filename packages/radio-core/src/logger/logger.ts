import pino from 'pino';

/**
 * Logger factory - creates structured logger instances
 */
export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => {
        return { level: label };
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

export type Logger = ReturnType<typeof createLogger>;