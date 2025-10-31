import { z } from 'zod';

/**
 * Asset content type enum
 */
export const assetContentTypeEnum = z.enum([
  'speech',
  'bed',
  'jingle',
  'music',
  'fx'
]);

export type AssetContentType = z.infer<typeof assetContentTypeEnum>;

/**
 * Asset validation status enum
 */
export const assetValidationStatusEnum = z.enum([
  'pending',
  'passed',
  'failed'
]);

export type AssetValidationStatus = z.infer<typeof assetValidationStatusEnum>;

/**
 * Asset schema - audio files with quality metrics
 */
export const assetSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique asset identifier'),
  
  // Storage
  storage_path: z.string().min(1).describe('Storage path or URL'),
  content_type: assetContentTypeEnum.describe('Type of audio content'),
  
  // Audio metrics
  lufs_integrated: z.number().min(-40).max(0).nullable().optional().describe('LUFS measurement'),
  peak_db: z.number().min(-40).max(0).nullable().optional().describe('Peak level in dB'),
  duration_sec: z.number().positive().nullable().optional().describe('Duration in seconds'),
  
  // Validation
  validation_status: assetValidationStatusEnum.default('pending').describe('Quality validation status'),
  validation_errors: z.array(z.string()).nullable().optional().describe('Validation error messages'),
  
  // Deduplication
  content_hash: z.string().nullable().optional().describe('SHA256 hash of content'),
  
  // Metadata
  metadata: z.record(z.unknown()).nullable().optional().describe('Additional metadata'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp')
});

export type Asset = z.infer<typeof assetSchema>;