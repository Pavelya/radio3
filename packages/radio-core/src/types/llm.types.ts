/**
 * LLM Service Types
 */

import type { RAGChunk } from '../schemas';

/**
 * Request for text generation
 */
export type GenerateRequest = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

/**
 * Response from text generation
 */
export type GenerateResponse = {
  text: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

/**
 * Script generation result with citations and metrics
 */
export type ScriptResult = {
  scriptMd: string;
  citations: any[];
  metrics: {
    inputTokens: number;
    outputTokens: number;
    generationTimeMs: number;
  };
};

/**
 * Context for segment generation including DJ info and RAG results
 */
export type SegmentContext = {
  slotType: string;
  targetDuration: number;
  djName: string;
  djPersonality: string;
  referenceTime: string;
  ragChunks: RAGChunk[];
  futureYear: number; // The broadcast year (e.g., 2525)
};
