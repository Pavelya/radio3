import { BaseError } from './base.error';

/**
 * TTS error - for text-to-speech failures
 */
export class TTSError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TTS_ERROR', 500, context);
  }
}