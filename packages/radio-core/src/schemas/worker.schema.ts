import { z } from 'zod';

/**
 * Worker configuration
 */
export const workerConfigSchema = z.object({
  workerType: z.string().min(1).describe('Type of worker (e.g., kb_index)'),
  instanceId: z.string().min(1).describe('Unique instance identifier'),
  maxConcurrentJobs: z.number().int().positive().describe('Max concurrent jobs'),
  heartbeatInterval: z.number().int().positive().describe('Heartbeat interval in seconds'),
  leaseSeconds: z.number().int().positive().describe('Job lease duration in seconds')
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

/**
 * Claimed job returned by claim_job function
 * (matches the RPC function return type)
 */
export const claimedJobSchema = z.object({
  job_id: z.string().uuid().describe('Job ID'),
  job_type: z.string().min(1).describe('Job type'),
  payload: z.record(z.unknown()).describe('Job payload'),
  attempts: z.number().int().nonnegative().describe('Attempt count'),
  max_attempts: z.number().int().positive().describe('Maximum attempts')
});

export type ClaimedJob = z.infer<typeof claimedJobSchema>;

/**
 * Job payload for kb_index jobs
 */
export const embedderJobPayloadSchema = z.object({
  source_id: z.string().uuid().describe('Source document ID'),
  source_type: z.enum(['universe_doc', 'event']).describe('Type of source document')
});

export type EmbedderJobPayload = z.infer<typeof embedderJobPayloadSchema>;
