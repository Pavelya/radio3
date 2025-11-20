#!/usr/bin/env node
/**
 * Supabase Storage Cleanup Script
 * Deletes ALL files from the audio-assets bucket
 *
 * This is the nuclear option for storage cleanup.
 * Use this when you want a fresh start.
 *
 * Usage:
 *   node infra/cleanup-storage.js
 *   node infra/cleanup-storage.js --dry-run  # Preview without deleting
 */

const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('../packages/radio-core/dist/index.js');

require('dotenv').config();

const logger = createLogger('cleanup-storage');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET_NAME = 'audio-assets';
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * List all files in a bucket recursively
 */
async function listAllFiles(path = '', allFiles = []) {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(path, {
      limit: 1000,
      offset: 0,
    });

  if (error) {
    logger.error({ error, path }, 'Failed to list files');
    throw error;
  }

  if (!data || data.length === 0) {
    return allFiles;
  }

  for (const item of data) {
    const fullPath = path ? `${path}/${item.name}` : item.name;

    if (item.id === null) {
      // Directory - recurse
      await listAllFiles(fullPath, allFiles);
    } else {
      // File
      allFiles.push(fullPath);
    }
  }

  return allFiles;
}

/**
 * Delete files in batches
 */
async function deleteFiles(files, batchSize = 100) {
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    if (DRY_RUN) {
      logger.info({ count: batch.length }, `[DRY RUN] Would delete ${batch.length} files`);
      deleted += batch.length;
      continue;
    }

    logger.info({
      progress: `${i + batch.length}/${files.length}`,
      batch: batch.length
    }, 'Deleting batch');

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(batch);

    if (error) {
      logger.error({ error, batch: batch.length }, 'Failed to delete batch');
      failed += batch.length;
    } else {
      deleted += batch.length;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { deleted, failed };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Main cleanup function
 */
async function main() {
  if (DRY_RUN) {
    logger.info('🔍 DRY RUN MODE - No files will be deleted');
  } else {
    logger.warn('⚠️  DANGER: This will delete ALL files in the storage bucket!');
    logger.warn('⚠️  Press Ctrl+C in the next 5 seconds to cancel...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  logger.info('='.repeat(60));
  logger.info('🗑️  STORAGE BUCKET CLEANUP');
  logger.info('='.repeat(60));
  logger.info({ bucket: BUCKET_NAME, dryRun: DRY_RUN });
  logger.info('');

  try {
    // List all files
    logger.info('📂 Listing all files in bucket...');
    const files = await listAllFiles();

    if (files.length === 0) {
      logger.info('✅ No files found. Bucket is already empty.');
      return;
    }

    logger.info({ count: files.length }, `Found ${files.length} files`);

    // Group by directory for summary
    const byDir = {};
    files.forEach(f => {
      const dir = f.includes('/') ? f.split('/')[0] : 'root';
      byDir[dir] = (byDir[dir] || 0) + 1;
    });

    logger.info('');
    logger.info('📊 Files by directory:');
    Object.entries(byDir).forEach(([dir, count]) => {
      logger.info(`  ${dir}/: ${count} files`);
    });
    logger.info('');

    // Delete files
    if (DRY_RUN) {
      logger.info(`[DRY RUN] Would delete ${files.length} files`);
      logger.info('Run without --dry-run to actually delete files');
    } else {
      logger.info('🗑️  Deleting files...');
      const { deleted, failed } = await deleteFiles(files);

      logger.info('');
      logger.info('='.repeat(60));
      logger.info('✅ CLEANUP COMPLETE');
      logger.info('='.repeat(60));
      logger.info({ deleted, failed, total: files.length });

      if (failed > 0) {
        logger.warn({ failed }, `${failed} files failed to delete`);
      }
    }

  } catch (error) {
    logger.error({ error }, 'Storage cleanup failed');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
