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

/**
 * Context for multi-speaker conversation generation
 */
export type ConversationContext = {
  format: 'interview' | 'panel' | 'debate' | 'dialogue';
  host: {
    name: string;
    personality: string;
  };
  participants: Array<{
    name: string;
    role: string;
    background?: string;
    expertise?: string;
  }>;
  topic: string;
  retrievedContext: string;
  duration: number; // seconds
  tone: string;
  futureYear?: number; // Default 2525
};

/**
 * Individual turn in a multi-speaker conversation
 */
export type ConversationTurn = {
  speaker: string;
  text: string;
};

/**
 * Result from conversation generation
 */
export type ConversationResult = {
  turns: ConversationTurn[];
  fullScript: string;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    generationTimeMs: number;
  };
};
