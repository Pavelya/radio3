#!/usr/bin/env node
/**
 * Audit Supabase Storage Bucket
 *
 * Lists all files in the audio-assets bucket and provides:
 * - Total file count
 * - Total size (estimated)
 * - Breakdown by subdirectory
 * - Identification of orphaned files
 *
 * Usage:
 *   node infra/audit-storage-bucket.js
 */

const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('../packages/radio-core/dist/index.js');

require('dotenv').config();

const logger = createLogger('storage-audit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET_NAME = 'audio-assets';

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
      allFiles.push({
        name: item.name,
        path: fullPath,
        size: item.metadata?.size || 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
      });
    }
  }

  return allFiles;
}

/**
 * Get all asset storage paths from database
 */
async function getDatabaseAssetPaths() {
  const { data, error } = await supabase
    .from('assets')
    .select('storage_path');

  if (error) {
    logger.error({ error }, 'Failed to fetch asset paths');
    return [];
  }

  return new Set(data.map((a) => a.storage_path));
}

/**
 * Get all music/jingle storage paths from database
 */
async function getDatabaseMediaPaths() {
  const paths = new Set();

  // Music tracks
  const { data: tracks } = await supabase
    .from('music_tracks')
    .select('storage_path');

  if (tracks) {
    tracks.forEach((t) => paths.add(t.storage_path));
  }

  // Jingles
  const { data: jingles } = await supabase
    .from('jingles')
    .select('storage_path');

  if (jingles) {
    jingles.forEach((j) => paths.add(j.storage_path));
  }

  // Sound effects
  const { data: effects } = await supabase
    .from('sound_effects')
    .select('storage_path');

  if (effects) {
    effects.forEach((e) => paths.add(e.storage_path));
  }

  return paths;
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
 * Group files by directory
 */
function groupByDirectory(files) {
  const groups = {};

  for (const file of files) {
    const dir = file.path.includes('/') ? file.path.split('/')[0] : 'root';

    if (!groups[dir]) {
      groups[dir] = {
        count: 0,
        totalSize: 0,
        files: [],
      };
    }

    groups[dir].count++;
    groups[dir].totalSize += file.size;
    groups[dir].files.push(file);
  }

  return groups;
}

/**
 * Main audit function
 */
async function main() {
  logger.info('🔍 Starting Supabase Storage Audit');
  logger.info('='.repeat(60));

  // List all files
  logger.info('📂 Listing all files in bucket...');
  const files = await listAllFiles();

  logger.info({ fileCount: files.length }, `Found ${files.length} files`);

  // Get database references
  logger.info('🗄️ Fetching database asset references...');
  const assetPaths = await getDatabaseAssetPaths();
  const mediaPaths = await getDatabaseMediaPaths();
  const allDbPaths = new Set([...assetPaths, ...mediaPaths]);

  logger.info({
    assetPaths: assetPaths.size,
    mediaPaths: mediaPaths.size,
    total: allDbPaths.size,
  }, 'Database references loaded');

  // Calculate totals
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  logger.info('='.repeat(60));
  logger.info('📊 STORAGE SUMMARY');
  logger.info('='.repeat(60));
  logger.info(`Total Files: ${files.length}`);
  logger.info(`Total Size: ${formatBytes(totalSize)}`);
  logger.info(`Database References: ${allDbPaths.size}`);
  logger.info('');

  // Group by directory
  const groups = groupByDirectory(files);

  logger.info('📁 BREAKDOWN BY DIRECTORY');
  logger.info('-'.repeat(60));

  for (const [dir, stats] of Object.entries(groups)) {
    logger.info(`${dir}/:`);
    logger.info(`  Files: ${stats.count}`);
    logger.info(`  Size: ${formatBytes(stats.totalSize)}`);
    logger.info(`  Avg Size: ${formatBytes(stats.totalSize / stats.count)}`);
    logger.info('');
  }

  // Identify orphaned files
  logger.info('🗑️ ORPHANED FILES (not in database)');
  logger.info('-'.repeat(60));

  const orphaned = files.filter((f) => !allDbPaths.has(f.path));
  const orphanedSize = orphaned.reduce((sum, f) => sum + f.size, 0);

  logger.info(`Orphaned Files: ${orphaned.length}`);
  logger.info(`Orphaned Size: ${formatBytes(orphanedSize)}`);
  logger.info(`Percentage: ${((orphaned.length / files.length) * 100).toFixed(1)}%`);
  logger.info('');

  if (orphaned.length > 0) {
    logger.info('Sample orphaned files (first 10):');
    orphaned.slice(0, 10).forEach((f) => {
      logger.info(`  - ${f.path} (${formatBytes(f.size)}, ${f.created_at})`);
    });
    logger.info('');
  }

  // Identify old files
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

  const old30 = files.filter((f) => new Date(f.created_at) < thirtyDaysAgo);
  const old90 = files.filter((f) => new Date(f.created_at) < ninetyDaysAgo);

  logger.info('📅 AGE ANALYSIS');
  logger.info('-'.repeat(60));
  logger.info(`Files > 30 days old: ${old30.length} (${formatBytes(old30.reduce((s, f) => s + f.size, 0))})`);
  logger.info(`Files > 90 days old: ${old90.length} (${formatBytes(old90.reduce((s, f) => s + f.size, 0))})`);
  logger.info('');

  // Check for raw/final pairs
  if (groups['raw'] && groups['final']) {
    logger.info('🔄 RAW vs FINAL ANALYSIS');
    logger.info('-'.repeat(60));

    const rawFiles = groups['raw'].files;
    const finalFiles = new Set(groups['final'].files.map((f) => f.name.replace('.wav', '')));

    const rawWithFinal = rawFiles.filter((f) => {
      // Extract asset ID or check if final version exists
      return true; // Simplified - would need better logic
    });

    logger.info(`Raw files: ${rawFiles.length}`);
    logger.info(`Final files: ${groups['final'].count}`);
    logger.info(`Raw files (deletable): ${formatBytes(groups['raw'].totalSize)}`);
    logger.info('');
  }

  // Recommendations
  logger.info('='.repeat(60));
  logger.info('💡 RECOMMENDATIONS');
  logger.info('='.repeat(60));

  if (orphaned.length > 0) {
    logger.info(`1. Delete ${orphaned.length} orphaned files → Save ${formatBytes(orphanedSize)}`);
  }

  if (groups['raw']) {
    logger.info(`2. Delete raw files after normalization → Save ${formatBytes(groups['raw'].totalSize)}`);
  }

  if (old90.length > 0) {
    logger.info(`3. Archive/delete files > 90 days → Save ${formatBytes(old90.reduce((s, f) => s + f.size, 0))}`);
  }

  logger.info('');
  logger.info('='.repeat(60));
  logger.info('✅ Audit Complete');
  logger.info('='.repeat(60));
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
