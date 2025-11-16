import { createLogger } from '@radio/core';
import { config } from 'dotenv';

// Load environment variables
config();

const logger = createLogger('tone-aggregator');

/**
 * Daily tone metrics aggregation
 * Runs once per day to calculate tone statistics
 * Calls the API endpoint to aggregate metrics
 */
export async function aggregateDailyToneMetrics(date?: string) {
  logger.info({ date }, 'Aggregating daily tone metrics');

  const apiUrl = process.env.API_URL || 'http://localhost:8000';
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const response = await fetch(`${apiUrl}/analytics/tone/aggregate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date: targetDate }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const metrics = await response.json();

    logger.info({ metrics }, 'Daily tone metrics aggregated successfully');
    return metrics;
  } catch (error) {
    logger.error({ error }, 'Failed to aggregate tone metrics');
    throw error;
  }
}

// Allow running as standalone script
if (require.main === module) {
  aggregateDailyToneMetrics()
    .then(() => {
      logger.info('Aggregation complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Aggregation failed');
      process.exit(1);
    });
}
