import { BaseError } from './base.error';

/**
 * RAG error - for retrieval failures
 */
export class RAGError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'RAG_ERROR', 500, context);
  }
}