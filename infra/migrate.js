#!/usr/bin/env node
/**
 * Simple migration runner for Supabase
 *
 * Usage:
 *   node infra/migrate.js up    # Run migrations
 *   node infra/migrate.js down  # Rollback last migration
 */

const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('@radio/core');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();

const logger = createLogger('migration-runner');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration(direction = 'up') {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(direction === 'up' ? '.sql' : '_down.sql'))
    .sort();

  if (direction === 'down') {
    files.reverse();
  }

  for (const file of files) {
    logger.info({ file }, 'Running migration');
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      const { error } = await supabase.rpc('exec_sql', { sql });
      if (error) throw error;
      logger.info({ file }, 'Migration completed');
    } catch (error) {
      logger.error({ file, error: error.message }, 'Migration failed');
      process.exit(1);
    }
  }

  logger.info('All migrations completed successfully');
}

const direction = process.argv[2] || 'up';
runMigration(direction);
