#!/usr/bin/env node
/**
 * Simple migration runner for PostgreSQL
 *
 * Usage:
 *   node infra/migrate.js up    # Run migrations
 *   node infra/migrate.js down  # Rollback last migration
 */

const { createLogger } = require('../packages/radio-core/dist/index.js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();

const logger = createLogger('migration-runner');

function runMigration(direction = 'up') {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => {
      if (direction === 'up') {
        return f.endsWith('.sql') && !f.endsWith('_down.sql');
      } else {
        return f.endsWith('_down.sql');
      }
    })
    .sort();

  if (direction === 'down') {
    files.reverse();
  }

  for (const file of files) {
    logger.info({ file }, 'Running migration');
    const sqlFile = path.join(migrationsDir, file);

    try {
      execSync(`psql ${process.env.DATABASE_URL} -f ${sqlFile}`, {
        stdio: 'inherit'
      });
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
