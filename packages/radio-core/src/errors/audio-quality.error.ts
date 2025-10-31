import { BaseError } from './base.error';

/**
 * Audio quality error - for audio validation failures
 */
export class AudioQualityError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIO_QUALITY_ERROR', 422, context);
  }
}