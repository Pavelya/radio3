import { BaseError } from './base.error';

/**
 * Validation error - for schema validation failures
 */
export class ValidationError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}