#!/usr/bin/env node
/**
 * Selective segment cleanup script
 * Deletes old queued/pending segments while preserving recent ready ones
 *
 * Usage:
 *   node infra/cleanup-old-segments.js [--dry-run] [--days=1]
 */

const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('../packages/radio-core/dist/index.js');

// Load environment
require('dotenv').config();

const logger = createLogger('cleanup-old-segments');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysArg = args.find(arg => arg.startsWith('--days='));
const daysToKeep = daysArg ? parseInt(daysArg.split('=')[1]) : 1;

async function cleanup() {
  logger.info({ dryRun, daysToKeep }, 'Starting selective segment cleanup');

  try {
    // Calculate cutoff date (in FUTURE year, e.g., 2525)
    const futureYearOffset = parseInt(process.env.FUTURE_YEAR_OFFSET || '500');
    const now = new Date();
    const futureNow = new Date(now);
    futureNow.setFullYear(now.getFullYear() + futureYearOffset);

    const cutoffDate = new Date(futureNow);
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    logger.info({
      realNow: now.toISOString(),
      futureNow: futureNow.toISOString(),
      cutoffDate: cutoffDate.toISOString()
    }, 'Date calculations');

    // Query 1: Count segments to delete (incomplete states)
    const { count: queuedCount } = await supabase
      .from('segments')
      .select('*', { count: 'exact', head: true })
      .in('state', ['queued', 'retrieving', 'generating', 'rendering', 'normalizing'])
      .lt('scheduled_start_ts', cutoffDate.toISOString());

    const { count: failedCount } = await supabase
      .from('segments')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'failed')
      .lt('scheduled_start_ts', cutoffDate.toISOString());

    logger.info({
      queuedOld: queuedCount || 0,
      failedOld: failedCount || 0,
      total: (queuedCount || 0) + (failedCount || 0)
    }, 'Segments to delete');

    if (dryRun) {
      logger.info('DRY RUN - No changes made');

      // Show sample segments that would be deleted
      const { data: samples } = await supabase
        .from('segments')
        .select('id, state, slot_type, scheduled_start_ts')
        .in('state', ['queued', 'retrieving', 'generating', 'rendering', 'normalizing', 'failed'])
        .lt('scheduled_start_ts', cutoffDate.toISOString())
        .order('scheduled_start_ts', { ascending: true })
        .limit(10);

      logger.info({ samples }, 'Sample segments (would delete)');
      return;
    }

    // Delete old incomplete segments
    logger.info('Deleting old incomplete segments...');
    const { error: queuedError, count: queuedDeleted } = await supabase
      .from('segments')
      .delete({ count: 'exact' })
      .in('state', ['queued', 'retrieving', 'generating', 'rendering', 'normalizing'])
      .lt('scheduled_start_ts', cutoffDate.toISOString());

    if (queuedError) {
      logger.error({ error: queuedError }, 'Failed to delete queued segments');
      throw queuedError;
    }

    logger.info({ deleted: queuedDeleted }, 'Old queued segments deleted');

    // Delete old failed segments
    logger.info('Deleting old failed segments...');
    const { error: failedError, count: failedDeleted } = await supabase
      .from('segments')
      .delete({ count: 'exact' })
      .eq('state', 'failed')
      .lt('scheduled_start_ts', cutoffDate.toISOString());

    if (failedError) {
      logger.error({ error: failedError }, 'Failed to delete failed segments');
      throw failedError;
    }

    logger.info({ deleted: failedDeleted }, 'Old failed segments deleted');

    // Delete orphaned jobs
    logger.info('Deleting orphaned jobs...');
    const { error: jobsError, count: jobsDeleted } = await supabase
      .from('jobs')
      .delete({ count: 'exact' })
      .eq('job_type', 'segment_make')
      .in('state', ['pending', 'processing'])
      .lt('created_at', cutoffDate.toISOString());

    if (jobsError) {
      logger.error({ error: jobsError }, 'Failed to delete orphaned jobs');
      throw jobsError;
    }

    logger.info({ deleted: jobsDeleted }, 'Orphaned jobs deleted');

    // Summary
    const totalDeleted = (queuedDeleted || 0) + (failedDeleted || 0);
    logger.info({
      segments: totalDeleted,
      jobs: jobsDeleted || 0,
      cutoffDate: cutoffDate.toISOString()
    }, 'Cleanup complete');

    // Show what's left
    const { count: remainingReady } = await supabase
      .from('segments')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'ready');

    const { count: remainingQueued } = await supabase
      .from('segments')
      .select('*', { count: 'exact', head: true })
      .in('state', ['queued', 'retrieving', 'generating', 'rendering', 'normalizing']);

    logger.info({
      ready: remainingReady || 0,
      queued: remainingQueued || 0
    }, 'Remaining segments');

  } catch (error) {
    logger.error({ error }, 'Cleanup failed');
    process.exit(1);
  }
}

cleanup();
