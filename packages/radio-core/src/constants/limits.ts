/**
 * System limits and thresholds
 */

// RAG limits
export const RAG_MAX_RESULTS = 50;
export const RAG_DEFAULT_TOP_K = 12;
export const RAG_TIMEOUT_MS = 2000;

// Audio limits
export const AUDIO_MIN_DURATION_SEC = 5;
export const AUDIO_MAX_DURATION_SEC = 600; // 10 minutes
export const AUDIO_TARGET_LUFS = -16;
export const AUDIO_PEAK_CEILING_DB = -1.0;

// Job limits
export const JOB_MAX_ATTEMPTS = 3;
export const JOB_DEFAULT_PRIORITY = 5;
export const JOB_LOCK_DURATION_SEC = 300; // 5 minutes

// Rate limits
export const API_RATE_LIMIT_PER_MINUTE = 60;
export const EMBEDDING_BATCH_SIZE = 32;