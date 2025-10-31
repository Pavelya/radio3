/**
 * Valid segment state transitions
 */
export const SEGMENT_STATE_TRANSITIONS: Record<string, string[]> = {
  queued: ['retrieving', 'failed'],
  retrieving: ['generating', 'failed'],
  generating: ['rendering', 'failed'],
  rendering: ['normalizing', 'failed'],
  normalizing: ['ready', 'failed'],
  ready: ['airing'],
  airing: ['aired'],
  aired: ['archived'],
  failed: ['queued'], // Manual retry only
  archived: []
};

/**
 * Valid job state transitions
 */
export const JOB_STATE_TRANSITIONS: Record<string, string[]> = {
  pending: ['processing'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: ['pending'] // Retry
};