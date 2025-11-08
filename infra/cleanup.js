#!/usr/bin/env node
/**
 * Database cleanup script
 * Deletes all dynamic test data (segments, jobs, DLQ, health checks)
 *
 * Usage:
 *   node infra/cleanup.js
 */

const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('../packages/radio-core/dist/index.js');

// Load environment
require('dotenv').config();

const logger = createLogger('cleanup-script');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  logger.info('Starting database cleanup');

  try {
    // 1. Delete all jobs
    logger.info('Deleting all jobs');
    const { error: jobsError, count: jobsCount } = await supabase
      .from('jobs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (jobsError) {
      logger.error({ error: jobsError }, 'Failed to delete jobs');
      throw jobsError;
    }

    logger.info({ count: jobsCount }, 'Jobs deleted');

    // 2. Delete all dead letter queue items
    logger.info('Deleting all dead letter queue items');
    const { error: dlqError, count: dlqCount } = await supabase
      .from('dead_letter_queue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (dlqError) {
      logger.error({ error: dlqError }, 'Failed to delete DLQ items');
      throw dlqError;
    }

    logger.info({ count: dlqCount }, 'DLQ items deleted');

    // 3. Delete all segments
    logger.info('Deleting all segments');
    const { error: segmentsError, count: segmentsCount } = await supabase
      .from('segments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (segmentsError) {
      logger.error({ error: segmentsError }, 'Failed to delete segments');
      throw segmentsError;
    }

    logger.info({ count: segmentsCount }, 'Segments deleted');

    // 4. Delete all worker health checks
    logger.info('Deleting all worker health checks');
    const { error: healthError, count: healthCount } = await supabase
      .from('health_checks')
      .delete()
      .neq('worker_type', 'none'); // Delete all

    if (healthError) {
      logger.error({ error: healthError }, 'Failed to delete health checks');
      throw healthError;
    }

    logger.info({ count: healthCount }, 'Health checks deleted');

    // Summary
    logger.info({
      jobs: jobsCount || 0,
      dlq: dlqCount || 0,
      segments: segmentsCount || 0,
      healthChecks: healthCount || 0
    }, 'Cleanup complete');

  } catch (error) {
    logger.error({ error }, 'Cleanup failed');
    process.exit(1);
  }
}

cleanup();
