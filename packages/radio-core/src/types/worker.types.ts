/**
 * Worker Job Payload Types
 */

/**
 * Payload for segment_make jobs
 */
export type SegmentGenPayload = {
  segment_id: string;
};

/**
 * TTS Service Types
 */

export type SynthesizeRequest = {
  text: string;
  model?: string;
  speed?: number;
  use_cache?: boolean;
};

export type SynthesizeResponse = {
  audio: string; // hex-encoded
  duration_sec: number;
  model: string;
  cached: boolean;
};

/**
 * Asset Storage Types
 */

export type StoredAsset = {
  assetId: string;
  storagePath: string;
  contentHash: string;
  durationSec: number;
};

/**
 * Audio Mastering Types
 */

/**
 * Payload for audio_finalize jobs
 */
export type MasteringJobPayload = {
  segment_id: string;
  asset_id: string;
  content_type: string;
};

export type ProcessingOptions = {
  targetLUFS: number;
  peakLimit: number;
  sampleRate: number;
};

export type ProcessingResult = {
  outputPath: string;
  lufsIntegrated: number;
  peakDb: number;
  durationSec: number;
  sizeBytes: number;
};
