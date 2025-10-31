import { z } from 'zod';

/**
 * Job state enum
 */
export const jobStateEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed'
]);

export type JobState = z.infer<typeof jobStateEnum>;

/**
 * Job schema - task queue
 */
export const jobSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique job identifier'),
  job_type: z.string().min(1).describe('Job type (kb_index, segment_make, etc)'),
  
  // Payload
  payload: z.record(z.unknown()).describe('Job payload data'),
  
  // State
  state: jobStateEnum.default('pending').describe('Current job state'),
  
  // Priority & Scheduling
  priority: z.number().int().min(1).max(10).default(5).describe('Job priority 1-10'),
  scheduled_for: z.string().datetime().describe('When job should run'),
  
  // Retry logic
  attempts: z.number().int().nonnegative().default(0).describe('Attempt count'),
  max_attempts: z.number().int().positive().default(3).describe('Maximum attempts'),
  
  // Worker tracking
  locked_until: z.string().datetime().nullable().optional().describe('Lock expiration'),
  locked_by: z.string().nullable().optional().describe('Worker instance ID'),
  
  // Error tracking
  error: z.string().nullable().optional().describe('Error message'),
  error_details: z.record(z.unknown()).nullable().optional().describe('Error details'),
  
  // Performance tracking
  started_at: z.string().datetime().nullable().optional().describe('When job started'),
  completed_at: z.string().datetime().nullable().optional().describe('When job completed'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type Job = z.infer<typeof jobSchema>;