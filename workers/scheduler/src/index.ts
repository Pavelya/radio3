import { ScheduleGenerator } from './schedule-generator';
import { createLogger } from '@radio/core';
import { addDays } from 'date-fns';
import { config } from 'dotenv';

// Load environment variables
config();

const logger = createLogger('scheduler-main');

/**
 * Scheduler Worker
 * Generates daily broadcast schedules
 */
async function main() {
  logger.info('Scheduler worker starting');

  const generator = new ScheduleGenerator();

  // Check if running as one-off or continuous
  const mode = process.env.SCHEDULER_MODE || 'continuous';

  if (mode === 'once') {
    // Generate tomorrow's schedule and exit
    logger.info('Running in one-off mode');
    await generator.generateTomorrowSchedule();
    logger.info('Schedule generation complete, exiting');
    process.exit(0);
  } else {
    // Continuous mode: run daily at 2 AM
    logger.info('Running in continuous mode');

    const runScheduler = async () => {
      try {
        // Check tomorrow's readiness
        const readiness = await generator.checkTomorrowReadiness();

        logger.info({
          ready: readiness.ready,
          total: readiness.total,
          percentage: readiness.percentage.toFixed(1)
        }, 'Tomorrow readiness check');

        // If less than 80% ready, generate new schedule
        if (readiness.percentage < 80) {
          logger.info('Generating tomorrow schedule');
          await generator.generateTomorrowSchedule();
        } else {
          logger.info('Tomorrow schedule already sufficient');
        }

        // Also generate for day after tomorrow to stay ahead
        const dayAfterTomorrow = addDays(new Date(), 2);
        await generator.generateScheduleForDate(dayAfterTomorrow);

      } catch (error) {
        logger.error({ error }, 'Scheduler run failed');
      }
    };

    // Run immediately on startup
    await runScheduler();

    // Schedule to run daily at 2 AM
    const scheduleNextRun = () => {
      const now = new Date();
      const next2AM = new Date(now);
      next2AM.setHours(2, 0, 0, 0);

      if (next2AM <= now) {
        // If 2 AM already passed today, schedule for tomorrow
        next2AM.setDate(next2AM.getDate() + 1);
      }

      const msUntilNext = next2AM.getTime() - now.getTime();

      logger.info({
        nextRun: next2AM.toISOString(),
        hoursUntil: (msUntilNext / 1000 / 60 / 60).toFixed(1)
      }, 'Next scheduled run');

      setTimeout(async () => {
        await runScheduler();
        scheduleNextRun(); // Schedule next run
      }, msUntilNext);
    };

    scheduleNextRun();

    // Keep process alive
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, exiting gracefully');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, exiting gracefully');
      process.exit(0);
    });
  }
}

main().catch(error => {
  logger.error({ error }, 'Scheduler crashed');
  process.exit(1);
});
