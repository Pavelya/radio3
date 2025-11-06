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
